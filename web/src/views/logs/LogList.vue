<template>
  <div class="log-list">
    <el-card shadow="never">
      <!-- 工具栏 -->
      <div class="toolbar">
        <el-select v-model="filters.success" placeholder="状态" clearable style="width: 120px" @change="loadData">
          <el-option label="全部" value="" />
          <el-option label="成功" :value="1" />
          <el-option label="失败" :value="0" />
        </el-select>
        <el-select v-model="filters.siteId" placeholder="选择网站" clearable style="width: 150px; margin-left: 12px" @change="loadData">
          <el-option v-for="site in siteOptions" :key="site.id" :label="site.name" :value="site.id" />
        </el-select>
        <el-date-picker
          v-model="filters.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="margin-left: 12px"
          @change="loadData"
        />
        <el-button @click="loadData" style="margin-left: 12px">
          <el-icon><Search /></el-icon>
          搜索
        </el-button>
      </div>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="site" label="网站" width="120">
          <template #default="{ row }">
            {{ row.site?.name || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="account" label="账号" width="120">
          <template #default="{ row }">
            {{ row.account?.name || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="clientIp" label="客户端IP" width="140" />
        <el-table-column prop="duration" label="时长参数" width="100" align="center" />
        <el-table-column prop="format" label="格式参数" width="100" align="center" />
        <el-table-column prop="success" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.success === 1 ? 'success' : 'danger'" size="small">
              {{ row.success === 1 ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="errorMessage" label="错误信息" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.errorMessage || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleViewDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDialog.visible" title="日志详情" width="600px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="ID">{{ detailDialog.data.id }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="detailDialog.data.success === 1 ? 'success' : 'danger'" size="small">
            {{ detailDialog.data.success === 1 ? '成功' : '失败' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="网站">{{ detailDialog.data.site?.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="账号">{{ detailDialog.data.account?.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="客户端IP">{{ detailDialog.data.clientIp }}</el-descriptions-item>
        <el-descriptions-item label="时长参数">{{ detailDialog.data.duration }}</el-descriptions-item>
        <el-descriptions-item label="格式参数">{{ detailDialog.data.format }}</el-descriptions-item>
        <el-descriptions-item label="时间">{{ formatDate(detailDialog.data.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="错误信息" :span="2">
          {{ detailDialog.data.errorMessage || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="响应内容" :span="2">
          <div class="response-preview">
            {{ detailDialog.data.responsePreview || '-' }}
          </div>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getLogList, getLogDetail } from '@/api/log'
import { getAllActiveSites } from '@/api/site'
import { Search } from '@element-plus/icons-vue'

const loading = ref(false)
const tableData = ref([])
const siteOptions = ref([])

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
      params.startDate = filters.dateRange[0].toISOString().split('T')[0]
      params.endDate = filters.dateRange[1].toISOString().split('T')[0]
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
  loadSites()
  loadData()
})
</script>

<style scoped>
.log-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.log-list > .el-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.log-list > .el-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.log-list > .el-card :deep(.el-table__wrapper) {
  flex: 1;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
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
</style>
