const express = require("express");
const crypto = require("crypto");
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

app.use(express.json());

// 配置静态文件服务
app.use(express.static(path.join(__dirname, "../frontend/dist")));

//定义一些常量
const PI = 3.1415926535897932384626;
const a = 6378245.0;
const ee = 0.00669342162296594323;

//定义全局变量
let amapKey;
let privateKeyBackend;

//生成2048位RSA密钥对
function generateRSAKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs1",
      format: "pem",
    }
  })
  return { publicKey, privateKey };
}

app.get("/rsaPublicKey", (req, res) => {
  const {privateKey, publicKey} = generateRSAKeyPair();
  privateKeyBackend = privateKey
  res.status(200).send(publicKey);
});
generateRSAKeyPair();

// 配置数据库连接池
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "province",
  password: process.env.DB_PASSWORD || "123456",
  port: process.env.DB_PORT || 5432,
});

//解密函数
function decryptWithPrivationKey(encryptedData, privateKey) {
  const buffer = Buffer.from(encryptedData, "base64");
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    buffer
  ).toString("utf8");
}
app.post('/key', async (req, res) => {
  try {
    
    const encryptedKey = req.body.amapKey
    amapKey = decryptWithPrivationKey(encryptedKey, privateKeyBackend)
    res.status(200).send('Key received securely')
  } catch (error) {
    console.error('Decryption failed:', error);
    res.status(500).send('Failed to decrypt key.')
    
  }
})

app.get("/provinces", async (req, res) => {
  try {
    const provinceCode = req.query.provinceCode;
    let result;
    if (provinceCode) {
      result = await pool.query("SELECT * FROM CITY_INFO WHERE code = $1", [
        provinceCode,
      ]);
    } else {
      result = await pool.query("SELECT * FROM PROVINCE_INFO");
    }
    res.status(200).json(result);
  } catch (error) {
    console.error("查询表数据失败:", error);
    res.status(500).json({ error: "查询表数据失败" });
  }
});

// 获取地理编码数据接口
app.get("/data", async (req, res) => {
  // 注意这里的路径是 /cities，而不是 /cityes
  try {
    const { code, level } = req.query;
    if (!code) {
      return res.status(400).json({ error: "缺少省份adcode参数" });
    }
    const result = await pool.query(
      `SELECT * FROM ${level.toUpperCase()}_INFO WHERE code = $1`,
      [code]
    );
    res.json(result);
  } catch (error) {
    console.error("查询区县数据失败:", error);
    res.status(500).json({ error: "查询区县数据失败" });
  }
});

// 测试数据库连接
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("成功连接到PostgreSQL数据库");
    client.release();
  } catch (error) {
    console.error("连接数据库失败:", error);
  }
}

testConnection();

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

/**
 * 去读json文件
 * 1. 读取文件
 * 2. 解析文件
 * 3. 遍历文件
 */
function readJsonFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(data));
      }
    });
  });
}

// readJsonFile("./json/geoinfo-all.json").then((data) => {
//   console.log(data);
//   data.forEach(async (item) => {
//     // const countResult = await pool.query("SELECT COUNT(*) FROM PROVINCE_INFO");
//     // const count = parseInt(countResult.rows[0].count, 10);
//     // if (count > 0) {
//     //   console.log("PROVINCE_INFO表已有数据，跳过插入。");
//     //   return;
//     // }
//     //省
//     const { adcode, name, center, level, citycode } = item;
//     const [longitude, latitude] = center.split(",");
//     const insertQuery = `
//       INSERT INTO PROVINCE_INFO (adcode, name, center, level, citycode)
//       VALUES ($1, $2, POINT($3, $4), $5, $6);`;
//     pool
//       .query(insertQuery, [adcode, name, longitude, latitude, level, citycode])
//       .then(() => {
//         console.log(`插入数据成功：${name}`);
//         insertData(item.districts, "CITY_INFO", adcode)
//       })
//       .catch((error) => {
//         console.error(`插入数据失败：${name}`, error);
//       });
//     // 插入数据到数据库
//     // ...
//   });
// });

// // 市
// async function insertData(items, tableName, parentCode) {
//   for (const item of items) {
//     // if (!item.districts || !Array.isArray(item.districts) || item.districts.length === 0) {
//     //   continue; // 终止条件：无下一层级数据则跳过
//     // }
//     const { adcode, name, center, level, citycode } = item;
//     const [longitude, latitude] = center.split(",");
//     const insertQuery = `
//       INSERT INTO ${tableName} (adcode, name, center, level, citycode, code)
//       VALUES ($1, $2, POINT($3, $4), $5, $6, $7);`;
//     try {
//       await pool.query(insertQuery, [adcode, name, longitude, latitude, level, citycode, parentCode]);
//       // 递归插入下一层级数据，表名由调用者传递（例如：市->区县时传递DISTRICT_INFO）
//       console.log(`插入数据成功：${name}`);
//       let nextTableName;
//       if (tableName === 'CITY_INFO') {
//         nextTableName = 'DISTRICT_INFO';
//       } else if (tableName === 'DISTRICT_INFO') {
//         // console.log(tableName, item.districts, "town");
//         nextTableName = 'TOWN_INFO';
//         console.log(nextTableName, "TOWN_INFO");
//       } else {
//         nextTableName = tableName;
//       }
//       await insertData(item.districts, nextTableName, item.adcode);
//     } catch (error) {
//       console.error(`插入${name}到${tableName}失败:`, error);
//     }
//   }
// }

const upload = multer({ storage });

// 文件上传接口
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  const params = JSON.parse(req.body.params);
  const provinceName = params.provinceLabel;
  const cityName = params.cityLabel;
  const districtName = params.districtLabel;
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
        console.log(amapKey, "amapKey");
        // 更新进度
        const api = "https://restapi.amap.com/v3/geocode/geo";
        const address = `${
          provinceName + cityName + districtName + row[keys[0]]
        }`;
        const params = {
          address,
          key: amapKey, //"4b97b6e6e5cfbd843ecaf8cd2a245ead",
          city: cityName,
        };
        const url = `${api}?${new URLSearchParams(params).toString()}`;
        // 添加重试机制和错误处理
        const maxRetries = 5;
        let retryDelay = 2000; // 初始延迟2秒（指数退避）
        let data;
        for (let retries = 0; retries < maxRetries; retries++) {
          try {
            const response = await fetch(url);
            data = await response.json();
            // 处理速率超限错误（指数退避+明确提示）
            if (
              data.status === "0" &&
              data.info === "CUQPS_HAS_EXCEEDED_THE_LIMIT"
            ) {
              console.warn(
                `地理编码API速率超限，当前重试次数：${
                  retries + 1
                }，当前延迟：${retryDelay}ms`
              );
              if (retries < maxRetries - 1) {
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
                retryDelay *= 2; // 指数退避（下次延迟翻倍）
                continue;
              } else {
                throw new Error(
                  `地理编码API达到最大重试次数（${maxRetries}次）仍速率超限，请检查API密钥配额限制`
                );
              }
            }
            // 加强数据校验：检查geocodes是否存在且有效
            if (
              !data.geocodes ||
              !Array.isArray(data.geocodes) ||
              data.geocodes.length === 0
            ) {
              throw new Error("地理编码API返回无效的geocodes结构");
            }
            break;
          } catch (error) {
            if (retries === maxRetries - 1) {
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
              console.error("地理编码API最终获取数据失败:", error.message);
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

const PORT = process.argv[3] || 3001;
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
