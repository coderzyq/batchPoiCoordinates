<template>
  <div class="container">
    <h1>批量获取POI坐标</h1>
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
            <el-option v-for="item in cities.districts" :key="item.value" :label="item.label"
              :value="item.value"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="区（县）" prop="district">
          <el-select v-model="form.district" placeholder="请选择区（县）" clearable>
            <el-option v-for="item in districts.districts" :key="item.value" :label="item.label"
              :value="item.value"></el-option>
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

      <label for="fileInput">选择Excel文件 (.xlsx, .xls)</label>
      &nbsp;&nbsp;
      <input type="file" id="fileInput" accept=".xlsx, .xls" title="选择Excel文件 (.xlsx, .xls)"
        @change="handleFileChange" />
      <el-button @click="uploadFile" type="primary" round>上传</el-button>
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
const backendPort = import.meta.env.VITE_BACKEND_PORT || '8081';
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
})

const provinces = ref([])
const cities = ref([])
const districts = ref([])
const towns = ref([])
let provinceData = []
const selectProvince = (value) => {
  fetchCity(value);
}

const selectCity = (value) => {
  fetchDistrict(value);
}

async function fetchProvinces() {
  try {
    if (provinceData.length > 0) {

    } else {
      
      const response = await fetch(`http://localhost:${backendPort}/provinces`)
      const data = await response.json()
      provinces.value = data.districts.map(item => ({
        label: item.name,
        value: item.adcode,
        districts: item.districts.map(district => ({
          label: district.name,
          value: district.adcode,
          districts: district.districts.map(district => ({
            label: district.name,
            value: district.adcode
          }))
        }))
      }))
      // sessionStorage.setItem('provinceData', JSON.stringify(provinceData))
      return provinces.value;
    }
  } catch (error) {
    console.error('获取省份数据失败:', error)
  }
}

async function fetchCity(provinceCode) {
  try {
    cities.value = provinces.value.find(city => city.value === provinceCode)
  } catch (error) {
    console.log(error, '获取城市数据失败');
  }
}

async function fetchDistrict(cityCode) {
  try {
    districts.value = cities.value.districts.find(district => district.value === cityCode)
  } catch (error) {

  }
}

onMounted(() => {
  fetchProvinces();

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
        console.log(data, "upload");
        if (data && data.message) {
          uploadStatus.value = '文件处理完成，可下载了！';
          fileProcessStatus.value = 'success';
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
  margin-bottom: 30px;
  padding: 20px;
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

/* .el-progress-circle {
  height: 50px !important;
  width: 50px !important;
} */
</style>