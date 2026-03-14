<template>
  <div class="log-list">
    <a-card :bordered="false">
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-row">
          <a-select v-model="filters.success" placeholder="状态" allow-clear class="filter-select" @change="loadData">
            <a-option label="全部" value="" />
            <a-option label="成功" :value="1" />
            <a-option label="失败" :value="0" />
          </a-select>
          <a-select v-model="filters.siteId" placeholder="选择网站" allow-clear class="filter-select" @change="loadData">
            <a-option v-for="site in siteOptions" :key="site.id" :label="site.name" :value="site.id" />
          </a-select>
        </div>
        <div class="toolbar-row">
          <a-range-picker
            v-model="filters.dateRange"
            class="date-picker"
            @change="loadData"
          />
          <a-button type="primary" @click="loadData">
            <template #icon><icon-search /></template>
            <span class="btn-text">搜索</span>
          </a-button>
        </div>
      </div>

      <!-- 桌面端表格 -->
      <a-table
        v-if="!isMobile"
        :data="tableData"
        :loading="loading"
        :pagination="false"
        :columns="columns"
        stripe
        style="width: 100%"
      >
        <template #site="{ record }">
          {{ record.site?.name || '-' }}
        </template>
        <template #account="{ record }">
          {{ record.account?.name || '-' }}
        </template>
        <template #success="{ record }">
          <a-tag :color="record.success === 1 ? 'green' : 'red'" size="small">
            {{ record.success === 1 ? '成功' : '失败' }}
          </a-tag>
        </template>
        <template #errorMessage="{ record }">
          <a-tooltip v-if="record.errorMessage" :content="record.errorMessage">
            <span class="ellipsis-text">{{ record.errorMessage }}</span>
          </a-tooltip>
          <span v-else>-</span>
        </template>
        <template #createdAt="{ record }">
          {{ formatDate(record.createdAt) }}
        </template>
        <template #action="{ record }">
          <a-button type="text" size="small" @click="handleViewDetail(record)">详情</a-button>
        </template>
      </a-table>

      <!-- 移动端卡片列表 -->
      <div v-else class="mobile-card-list">
        <a-spin :loading="loading" style="width: 100%;">
          <div v-for="item in tableData" :key="item.id" class="mobile-card">
            <div class="card-header">
              <span class="card-title">ID: {{ item.id }}</span>
              <a-tag :color="item.success === 1 ? 'green' : 'red'" size="small">
                {{ item.success === 1 ? '成功' : '失败' }}
              </a-tag>
            </div>
            <div class="card-body">
              <div class="card-row">
                <span class="card-label">网站:</span>
                <span class="card-value">{{ item.site?.name || '-' }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">账号:</span>
                <span class="card-value">{{ item.account?.name || '-' }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">客户端IP:</span>
                <span class="card-value">{{ item.clientIp }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">时长/格式:</span>
                <span class="card-value">{{ item.duration || '-' }} / {{ item.format || '-' }}</span>
              </div>
              <div class="card-row" v-if="item.errorMessage">
                <span class="card-label">错误信息:</span>
                <span class="card-value error-text">{{ item.errorMessage }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">时间:</span>
                <span class="card-value">{{ formatDate(item.createdAt) }}</span>
              </div>
            </div>
            <div class="card-actions">
              <a-button type="primary" size="small" @click="handleViewDetail(item)">查看详情</a-button>
            </div>
          </div>
          <a-empty v-if="!loading && tableData.length === 0" description="暂无数据" />
        </a-spin>
      </div>

      <!-- 分页 -->
      <div class="pagination">
        <a-pagination
          v-model:current="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-size-options="[10, 20, 50, 100]"
          :show-total="true"
          :show-jumper="!isMobile"
          :show-page-size="!isMobile"
          :size="isMobile ? 'mini' : 'medium'"
          @change="loadData"
          @page-size-change="loadData"
        />
      </div>
    </a-card>

    <!-- 详情对话框 -->
    <a-modal
      v-model:visible="detailDialog.visible"
      title="日志详情"
      :width="isMobile ? '95%' : '600px'"
      :footer="false"
    >
      <a-descriptions :column="isMobile ? 1 : 2" bordered size="small">
        <a-descriptions-item label="ID">{{ detailDialog.data.id }}</a-descriptions-item>
        <a-descriptions-item label="状态">
          <a-tag :color="detailDialog.data.success === 1 ? 'green' : 'red'" size="small">
            {{ detailDialog.data.success === 1 ? '成功' : '失败' }}
          </a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="网站">{{ detailDialog.data.site?.name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="账号">{{ detailDialog.data.account?.name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="客户端IP">{{ detailDialog.data.clientIp }}</a-descriptions-item>
        <a-descriptions-item label="时长参数">{{ detailDialog.data.duration }}</a-descriptions-item>
        <a-descriptions-item label="格式参数">{{ detailDialog.data.format }}</a-descriptions-item>
        <a-descriptions-item label="时间">{{ formatDate(detailDialog.data.createdAt) }}</a-descriptions-item>
        <a-descriptions-item label="错误信息" :span="isMobile ? 1 : 2">
          {{ detailDialog.data.errorMessage || '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="响应内容" :span="isMobile ? 1 : 2">
          <div class="response-preview">
            {{ detailDialog.data.responsePreview || '-' }}
          </div>
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { getLogList, getLogDetail } from '@/api/log'
import { getAllActiveSites } from '@/api/site'
import { IconSearch } from '@arco-design/web-vue/es/icon'

const loading = ref(false)
const tableData = ref([])
const siteOptions = ref([])

// 响应式检测
const isMobile = ref(false)
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
}

const filters = reactive({
  success: '',
  siteId: '',
  dateRange: null
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const detailDialog = reactive({
  visible: false,
  data: {}
})

// 表格列配置
const columns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '网站', dataIndex: 'site', width: 120, slotName: 'site' },
  { title: '账号', dataIndex: 'account', width: 120, slotName: 'account' },
  { title: '客户端IP', dataIndex: 'clientIp', width: 140 },
  { title: '时长参数', dataIndex: 'duration', width: 100, align: 'center' },
  { title: '格式参数', dataIndex: 'format', width: 100, align: 'center' },
  { title: '状态', dataIndex: 'success', width: 80, align: 'center', slotName: 'success' },
  { title: '错误信息', dataIndex: 'errorMessage', minWidth: 150, slotName: 'errorMessage' },
  { title: '时间', dataIndex: 'createdAt', width: 160, slotName: 'createdAt' },
  { title: '操作', width: 100, fixed: 'right', slotName: 'action' }
]

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}

const loadSites = async () => {
  try {
    const res = await getAllActiveSites()
    siteOptions.value = res.data
  } catch (error) {
    // 错误已处理
  }
}

const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      success: filters.success,
      siteId: filters.siteId
    }

    if (filters.dateRange && filters.dateRange.length === 2) {
      params.startDate = filters.dateRange[0]
      params.endDate = filters.dateRange[1]
    }

    const res = await getLogList(params)
    tableData.value = res.data.list
    pagination.total = res.data.total
  } catch (error) {
    // 错误已处理
  } finally {
    loading.value = false
  }
}

const handleViewDetail = async (row) => {
  try {
    const res = await getLogDetail(row.id)
    detailDialog.data = res.data
    detailDialog.visible = true
  } catch (error) {
    // 错误已处理
  }
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  loadSites()
  loadData()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.log-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.log-list > .a-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.log-list > :deep(.a-card-body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.ellipsis-text {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select {
  width: 120px;
}

.date-picker {
  flex: 1;
  max-width: 280px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.response-preview {
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  background: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
}

/* 移动端卡片样式 */
.mobile-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
}

.mobile-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.card-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.card-label {
  color: #909399;
  font-size: 13px;
  min-width: 70px;
  flex-shrink: 0;
}

.card-value {
  color: #606266;
  font-size: 13px;
  word-break: break-all;
}

.error-text {
  color: #F56C6C;
}

.card-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.card-actions .a-button {
  flex: 1;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .toolbar-row {
    width: 100%;
  }

  .filter-select {
    flex: 1;
    min-width: 100px;
  }

  .date-picker {
    width: 100%;
    max-width: none;
  }

  .toolbar-row .a-button {
    flex: 1;
  }

  .pagination {
    overflow-x: auto;
    justify-content: center;
  }

  .response-preview {
    max-height: 150px;
  }
}
</style>
