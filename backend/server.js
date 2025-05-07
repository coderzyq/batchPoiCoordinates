const express = require("express");
const { Pool } = require("pg");
const multer = require("multer");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const app = express();
const WebSocket = require("ws");

require("dotenv").config();
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// 配置静态文件服务
app.use(express.static(path.join(__dirname, '../frontend/dist')));

//定义一些常量
const PI = 3.1415926535897932384626;
const a = 6378245.0;
const ee = 0.00669342162296594323;

let districts = [];
// 配置数据库连接池
// const pool = new Pool({
//   user: process.env.DB_USER || "postgres",
//   host: process.env.DB_HOST || "localhost",
//   database: process.env.DB_NAME || "postgres",
//   password: process.env.DB_PASSWORD || "postgres",
//   port: process.env.DB_PORT || 5432,
// });

app.get("/provinces", async (req, res) => {
  const response = await fetch(
    "https://restapi.amap.com/v3/config/district?subdistrict=3&key="
  );
  const data = await response.json();
  districts = data.districts[0];
  res.json(districts);
  // res = data
});
// 测试数据库连接
// async function testConnection() {
//   try {
//     const client = await pool.connect();
//     console.log("成功连接到PostgreSQL数据库");
//     client.release();
//   } catch (error) {
//     console.error("连接数据库失败:", error);
//   }
// }

// testConnection();

app.use(express.static(path.join(__dirname, "../frontend")));
const storage = multer.diskStorage({
  destination: path.join(__dirname, "uploads"),
  filename: (req, file, cb) => {
    const filename = Buffer.from(file.originalname, "latin1").toString("utf8");
    cb(null, filename);
  },
  onFileUploadComplete: (file) => {
    console.log(`文件${file.originalname}上传完成，保存路径：${file.path}`);
  },
});

const upload = multer({ storage });

// 文件上传接口
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  const params = JSON.parse(req.body.params);
  const province = districts.districts.find(
    (item) => item.adcode === params.province
  );
  const city = province.districts.find((item) => item.adcode === params.city);
  const district = city.districts.find(
    (item) => item.adcode === params.district
  );
  const provinceName = province.name;
  const cityName = city.name;
  const districtName = district.name;
  try {
    let jsonData;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    if (fileExt === ".xlsx" || fileExt === ".xls") {
      // 读取Excel文件
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      jsonData = xlsx.utils.sheet_to_json(worksheet);
    } else if (fileExt === ".csv") {
      // 读取CSV文件
      const fileContent = fs.readFileSync(req.file.path, "utf8");
      jsonData = fileContent
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const values = line.split(",");
          const obj = {};
          values.forEach((value, index) => {
            obj[`列${index + 1}`] = value.trim();
          });
          return obj;
        });
    } else {
      throw new Error("不支持的文件格式");
    }
    let processedCount = 0;
    const totalCount = jsonData.length;
    const processedData = await Promise.all(
      jsonData.map(async (row) => {
        const keys = Object.keys(row);
        // 创建新对象合并原始数据和新增字段
        const newRow = {
          ...row,
          省份: provinceName,
          城市: cityName,
          区县: districtName,
          location: "",
          longitude: "",
          latitude: "",
        };

        // 更新进度
        const api = "https://restapi.amap.com/v3/geocode/geo";
        const address = `${
          provinceName + cityName + districtName + row[keys[0]]
        }`;
        const params = {
          address,
          key: "",
          city: cityName,
        };
        const url = `${api}?${new URLSearchParams(params).toString()}`;

        // 添加重试机制和错误处理
        let retries = 3;
        let data;
        while (retries > 0) {
          try {
            const response = await fetch(url);
            data = await response.json();
            // 处理API调用限制错误
            if (
              data.status === "0" &&
              data.info === "CUQPS_HAS_EXCEEDED_THE_LIMIT"
            ) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              continue;
            }

            break;
          } catch (error) {
            retries--;
            if (retries === 0) {
              // 返回基础数据
              data = {
                count: 0,
                geocodes: [
                  {
                    formatted_address: address,
                    location: "",
                    city: cityName,
                  },
                ],
              };
            }
          }
        }
        if (
          Number(data.count) > 0 &&
          data.geocodes[0].formatted_address === address
        ) {
          const location = data.geocodes[0].location; // 提取经纬度
          let longitude = location.split(",")[0]; // 提取经度
          let latitude = location.split(",")[1]; // 提取纬度
          [longitude, latitude] = transformGcj02ToWgs84(longitude, latitude);
          newRow["location"] = location; // 将经纬度添加到新列中
          newRow["longitude"] = longitude;
          newRow["latitude"] = latitude;
          newRow["描述"] =
            "区域正确，经纬度已转换, location为gcj02坐标，longitude和latitude为wgs84坐标"; // 将经纬度添加到新列中
        } else {
          newRow["location"] = "0,0";
          newRow["longitude"] = newRow["latitude"] = 0;
          newRow["描述"] = "区域不对，将经纬度都设为0"; // 将经纬度添加到新列中
        }
        // 更新进度
        processedCount++;
        const progress = Math.round((processedCount / totalCount) * 100);
        broadcastProgress(progress);
        return newRow;
      })
    );

    // 将处理后的数据写回Excel格式
    const newWorkbook = xlsx.utils.book_new();
    const newWorksheet = xlsx.utils.json_to_sheet(processedData);
    xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, "Sheet1");

    // 保存处理后的文件
    const processedFilePath = path.join(
      __dirname,
      "processed",
      `${req.file.originalname}-processed${fileExt}`
    );

    if (fileExt === ".xlsx" || fileExt === ".xls") {
      xlsx.writeFile(newWorkbook, processedFilePath);
    } else if (fileExt === ".csv") {
      const csvContent = jsonData
        .map((row) => Object.values(row).join(","))
        .join("\n");
      fs.writeFileSync(processedFilePath, csvContent);
    }

    res.json({
      message: "File processed successfully",
      downloadUrl: `download/${path.basename(processedFilePath)}`,
    });
  } catch (error) {
    console.log(error, "error");
    res.status(500).send("Error processing file: " + error.message);
  } finally {
    // 删除上传的临时文件
    fs.unlinkSync(req.file.path);
  }
});

// 文件下载接口
app.get("/download/:filename", (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(__dirname, "processed", filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath, filename);
  } else {
    res.status(404).send("File not found");
  }
});

// 创建必要的目录
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}
if (!fs.existsSync("processed")) {
  fs.mkdirSync("processed");
}

// 添加根路径处理
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

const PORT = process.argv[3] || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// 广播进度给所有客户端
function broadcastProgress(progress) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "progress", progress }));
    }
  });
}

//查询行政区域
async function getDistrict(key) {
  try {
    const response = await fetch(
      "https://restapi.amap.com/v3/config/district?subdistrict=3&key=" + key
    );
    const data = await response.json();
    if (data?.districts?.length > 0) {
      return data.districts[0].districts;
    }
    return [];
  } catch (error) {
    console.log(error);
    return [];
  }
}

/**
 * 坐标系转换（gcj02转wgs84，即高德转84）
 */
function transformGcj02ToWgs84(lng, lat) {
  lat = +lat;
  lng = +lng;
  if (out_of_china(lng, lat)) {
    return [lng, lat];
  } else {
    let dlat = transformlat(lng - 105.0, lat - 35.0);
    let dlng = transformlng(lng - 105.0, lat - 35.0);
    let radlat = (lat / 180.0) * PI;
    let magic = Math.sin(radlat);
    magic = 1 - ee * magic * magic;
    let sqrtmagic = Math.sqrt(magic);
    dlat = (dlat * 180.0) / (((a * (1 - ee)) / (magic * sqrtmagic)) * PI);
    dlng = (dlng * 180.0) / ((a / sqrtmagic) * Math.cos(radlat) * PI);
    let mglat = lat + dlat;
    let mglng = lng + dlng;
    return [lng * 2 - mglng, lat * 2 - mglat];
  }
}

function transformlat(lng, lat) {
  lat = +lat;
  lng = +lng;
  let ret =
    -100.0 +
    2.0 * lng +
    3.0 * lat +
    0.2 * lat * lat +
    0.1 * lng * lat +
    0.2 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) /
    3.0;
  ret +=
    ((160.0 * Math.sin((lat / 12.0) * PI) + 320 * Math.sin((lat * PI) / 30.0)) *
      2.0) /
    3.0;
  return ret;
}

function transformlng(lng, lat) {
  lat = +lat;
  lng = +lng;
  let ret =
    300.0 +
    lng +
    2.0 * lat +
    0.1 * lng * lng +
    0.1 * lng * lat +
    0.1 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(lng * PI) + 40.0 * Math.sin((lng / 3.0) * PI)) * 2.0) /
    3.0;
  ret +=
    ((150.0 * Math.sin((lng / 12.0) * PI) +
      300.0 * Math.sin((lng / 30.0) * PI)) *
      2.0) /
    3.0;
  return ret;
}

/**
 * 判断是否在国内，不在国内则不做偏移
 * @param lng
 * @param lat
 * @returns {boolean}
 */
function out_of_china(lng, lat) {
  lat = +lat;
  lng = +lng;
  // 纬度3.86~53.55,经度73.66~135.05
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}
