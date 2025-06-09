<template>
  <div class="container">
    <h1>批量获取POI坐标</h1>
    <div>高德密钥
      <el-input v-model="amapKey" style="width: 240px; padding-left: 5px;" type="password" placeholder="请输入高德key密钥"
        @change="amapKeyChange" clearable />
      <el-tooltip effect="dark" content="获取高德地图的密钥" placement="top">
        <el-icon class="is-infoFilled" size="30" @click="getAmapKey">
          <InfoFilled />
        </el-icon>
      </el-tooltip>
    </div>
    <h4>只支持excel文件，不支持csv格式</h4>
    <div class="upload-select animate__animated animate__backInDown">
      <el-form :inline="true" class="demo-form-inline" :rules="rules" ref="ruleFormRef" :model="form">
        <el-form-item label="省" prop="province">
          <el-select v-model="form.province" placeholder="请选择省" clearable @change="selectProvince">
            <el-option v-for="item in provinces" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="市" prop="city">
          <el-select v-model="form.city" placeholder="请选择市" clearable @change="selectCity">
            <el-option v-for="item in cities" :key="item.value" :label="item.label" :value="item.value"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="区（县）" prop="district">
          <el-select v-model="form.district" placeholder="请选择区（县）" clearable @change="selectDistrict">
            <el-option v-for="item in districts" :key="item.value" :label="item.label" :value="item.value"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="镇（街道）">
          <el-input v-model="form.town" placeholder="请输入镇（街道）" clearable></el-input>
          <!-- <el-select v-model="form.town" placeholder="请输入镇（街道）" clearable>
            <el-option v-for="item in towns.districts" :key="item.value" :label="item.label"
              :value="item.value"></el-option>
          </el-select> -->
        </el-form-item>
      </el-form>
    </div>
    <div class="upload-section animate__animated animate__backInLeft">
      <h2>上传Excel文件</h2>
      <!-- <h5>不支持csv格式</h5> -->
      <div class="excelInput">
        <label for="fileInput">选择Excel文件 (.xlsx, .xls)</label>
        &nbsp;&nbsp;
        <input type="file" id="fileInput" accept=".xlsx, .xls" title="选择Excel文件 (.xlsx, .xls)"
          @change="handleFileChange" />
        <el-tooltip
          content="上传"
          placement="top"
          effect="dark"
          :disabled="!fileInput"
          :open-delay="1000"
          :close-delay="1000"
        >
          <el-icon @click="uploadFile" class="is-uploadFilled" size="28">
          <UploadFilled />
        </el-icon>
        </el-tooltip>
      </div>
      <div id="uploadStatus">{{ uploadStatus }}</div>
      <el-progress type="circle" :percentage="percentage" :status="fileProcessStatus" v-show="processShow" indeterminate
        :width="55" :stroke-width="7" striped stripe-flow />

    </div>

    <div class="download-section animate__animated animate__backInRight">
      <h2>下载处理后的文件</h2>
      <el-button id="downloadBtn" :disabled="!downloadUrl" @click="downloadFile" type="primary" round>
        下载处理后的文件
      </el-button>
      <div id="downloadStatus">{{ downloadStatus }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
const backendPort = import.meta.env.VITE_BACKEND_PORT || '3000';
const amapKey = ref('');
const fileInput = ref(null);
const uploadStatus = ref('先选择文件，再点击上传按钮');
const downloadStatus = ref('');
const downloadUrl = ref('');
const ruleFormRef = ref(null);
const percentage = ref(0);
const ws = ref(null);
const fileProcessStatus = ref('');
const processShow = ref(false);

const rules = {
  province: [
    {
      required: true,
      message: '请选择省份',
      trigger: 'change',
    }
  ],
  city: [
    {
      required: true,
      message: '请选择城市',
      trigger: 'change',
    }
  ],
  district: [
    {
      required: true,
      message: '请选择区（县）',
      trigger: 'change',
    }
  ],
}
const form = reactive({
  province: '',
  city: '',
  district: '',
  town: '',
  districtLabel: '',
  cityLabel: '',
  provinceLabel: '',
})

const provinces = ref([])
const cities = ref([])
const districts = ref([])
const towns = ref([])
const publicKeyPem = ref('')

const getAmapKey = async () => {
  window.open('https://lbs.amap.com/', '_blank')
}
//使用Web Crypto API加密敏感数据
const encrypWithPublicKey = async (data, publicKeyPem) => {
  //将PEM格式的公钥转换为CryptoKey对象
  const pemHeader = "-----BEGIN PUBLIC KEY-----";
  const pemFooter = "-----END PUBLIC KEY-----";
  const pemContents = publicKeyPem.replace(pemHeader, "").replace(pemFooter, "").replace(/\s+/g, ""); // 去除换行和空格
  const publicKeyBytes = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const publicKey = await crypto.subtle.importKey(
    "spki",
    publicKeyBytes,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"]
  );
  //2.加密数据
  const encodedData = new TextEncoder().encode(data);
  const encryptedData = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    encodedData
  );
  //3.将加密后的数据转换为Base64编码
  return btoa(String.fromCharCode(...new Uint8Array(encryptedData)));
}

const getRsaPublicKey = async () => {
  try {
    const response = await fetch(`http://localhost:${backendPort}/rsaPublicKey`);
    const res = await response.text();
    if (res) {
      publicKeyPem.value = res;
    }
  } catch (error) {
    console.error('获取公钥失败:', error);
  }
}
const selectProvince = async (value) => {
  const selectedProvince = provinces.value.find(item => item.value === value);
  if (selectedProvince) {
    form.provinceLabel = selectedProvince.label;
  }
  cities.value = await selectToGetNextData(value, "city")
}

const amapKeyChange = async (value) => {
  if (value === '') return
  try {
    encrypWithPublicKey(value, publicKeyPem.value).then(async (encryptedData) => {
      const response = await fetch(`http://localhost:${backendPort}/key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amapKey: encryptedData }),
      });
      const result = await response.json();
      console.log('Encryption设置结果:', result);
    })
  } catch (error) {
    console.error('Encryption密钥失败:', error)
  }
}

/**
 * @description 获取下一数据（城市或者区县或城镇）
 * @param code 上一级的行政编码
 * @param level 当前等级
 * @returns {Promise<Array>} 当前等级的数据
 */
const selectToGetNextData = async (code, level) => {
  try {
    const params = new URLSearchParams({ code, level });
    const response = await fetch(`http://localhost:${backendPort}/data?${params}`, {
      method: 'GET'
    })
    const data = await response.json()
    return data.rows.map(item => ({
      label: item.name,
      value: item.adcode,
      level: item.level,
      cityCode: item.cityCode,
    }))
  } catch (error) {
    console.error('获取下一数据失败:', error)
  }
}

const selectCity = async (value) => {
  // 获取选中的城市label
  const selectedCity = cities.value.find(item => item.value === value);
  if (selectedCity) {
    form.cityLabel = selectedCity.label;
  }
  districts.value = await selectToGetNextData(value, "district")
}

const selectDistrict = (value) => {
  // 获取选中的城市label
  const selectedDistrict = districts.value.find(item => item.value === value);
  if (selectedDistrict) {
    form.districtLabel = selectedDistrict.label;
  }
}

async function fetchProvinces() {
  try {
    if (provinces.value.length > 0) return
    const response = await fetch(`http://localhost:${backendPort}/provinces`)
    const data = await response.json()
    provinces.value = data.rows.map(item => ({
      label: item.name,
      value: item.adcode,
      level: item.level,
      cityCode: item.cityCode,
    }))
  }
  catch (error) {
    console.error('获取省份数据失败:', error);
  }
}



onMounted(async () => {
  fetchProvinces();
  await getRsaPublicKey()
  // 连接WebSocket
  ws.value = new WebSocket(`ws://localhost:${backendPort}`);
  ws.value.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'progress') {
      percentage.value = data.progress;
    }
  };

  ws.value.onclose = () => {
    console.log('WebSocket连接关闭');
  };
})

function handleFileChange(event) {
  fileInput.value = event.target.files[0];
  uploadStatus.value = '已选择' + fileInput.value.name + ', 请点击上传按钮';
}

async function uploadFile() {
  if (!fileInput.value) {
    uploadStatus.value = '请先选择文件';
    return;
  }
  try {
    await ruleFormRef.value.validate(async (validate, fields) => {
      if (validate) {
        const formData = new FormData();
        formData.append('file', fileInput.value);
        formData.append('params', JSON.stringify(form))

        uploadStatus.value = '处理中...';
        fileProcessStatus.value = '';
        processShow.value = true;
        const response = await fetch(`http://localhost:${backendPort}/upload`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data && data.message) {
          uploadStatus.value = '文件处理完成，可下载了！';
          fileProcessStatus.value = 'success';
          // 处理完成后关闭WebSocket连接
          if (ws.value) {
            ws.value.close();
          }
        }
        downloadUrl.value = data.downloadUrl;
        downloadStatus.value = '';
      }
    });
  } catch (error) {
    uploadStatus.value = '上传失败: ' + error.message;
    downloadUrl.value = '';
    console.error('Error:', error);
  }
}

function downloadFile() {
  if (!downloadUrl.value) return;

  downloadStatus.value = '下载中...';

  const a = document.createElement('a');
  a.href = `http://localhost:${backendPort}/${downloadUrl.value}`;
  a.download = '';
  a.click();

  setTimeout(() => {
    downloadStatus.value = '下载完成！';
    // 关闭WebSocket连接
    if (ws.value) {
      ws.value.close();
    }
  }, 1000);
}


</script>

<style>
.container {
  font-family: Arial, sans-serif;
  max-width: 1000px;
  width: 100%;
  margin: 0 auto;
  /* padding: 20px; */
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  box-sizing: border-box;
}

.upload-select,
.upload-section,
.download-section {
  margin-bottom: 15px;
  padding: 15px;
  /* border: 1px solid #ddd; */
  border-radius: 5px;
  text-align: center;
}

label {
  font-size: 25px;
  cursor: pointer;

}

label:hover {
  color: blue;
}

input[type="file"] {
  display: none;
  font-size: 25px;

}

input[type="file"]:hover {
  color: blue;
  cursor: pointer;
}

.upload-select {
  display: flex;
  justify-content: center;
  align-items: center;
}

button {
  padding: 10px 15px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #45a049;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

#uploadStatus,
#downloadStatus {
  margin-top: 10px;
  color: #666;
}

.demo-form-inline {
  display: flex;
  justify-content: space-around;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  width: 100%;
}

.demo-form-inline .el-input {
  --el-input-width: 120px;
}

.demo-form-inline .el-select {
  --el-select-width: 120px;
}

.el-form-item {
  /* margin-bottom: 0; */
  margin: 16px !important;
}

.el-form-item__label {
  font-size: 20px !important;
  font-weight: bold;
}

.excelInput {
  height: 40px;
  padding-bottom: 3px;
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  width: 100%;
  align-items: center;
}

.is-infoFilled {
  font-size: 30px !important;
  /* color: #409eff !important; */
  padding-left: 0.2em;
  cursor: pointer;
  vertical-align: middle;
}

.is-uploadFilled {
  font-size: 28px !important;
  /* color: #67c23a!important; */
  padding-right: 0;
  vertical-align: middle;
  cursor: pointer;
  /* color: gray !important; */
}

/* .el-progress-circle {
  height: 50px !important;
  width: 50px !important;
} */
</style>