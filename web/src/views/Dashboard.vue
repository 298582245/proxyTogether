<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stat-cards">
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-icon" style="background: #409EFF">
              <el-icon size="24"><Wallet /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totalBalance.toFixed(2) }}</div>
              <div class="stat-label">总余额</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-icon" style="background: #67C23A">
              <el-icon size="24"><User /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totalCount }}</div>
              <div class="stat-label">总账号数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-icon" style="background: #E6A23C">
              <el-icon size="24"><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.activeCount }}</div>
              <div class="stat-label">启用账号</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-icon" style="background: #F56C6C">
              <el-icon size="24"><CircleClose /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.inactiveCount }}</div>
              <div class="stat-label">禁用账号</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 日志统计 -->
    <el-row :gutter="20" class="log-stats">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <span>今日统计</span>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="今日请求">{{ logStats.todayRequests }}</el-descriptions-item>
            <el-descriptions-item label="今日成功">{{ logStats.todaySuccess }}</el-descriptions-item>
            <el-descriptions-item label="总请求数">{{ logStats.totalRequests }}</el-descriptions-item>
            <el-descriptions-item label="总成功数">{{ logStats.successRequests }}</el-descriptions-item>
            <el-descriptions-item label="成功率">{{ logStats.successRate }}%</el-descriptions-item>
            <el-descriptions-item label="失败数">{{ logStats.failRequests }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>快速操作</span>
            </div>
          </template>
          <div class="quick-actions">
            <el-button type="primary" @click="handleRefreshBalance" :loading="refreshing">
              刷新所有余额
            </el-button>
            <el-button @click="copyProxyUrl">
              复制代理接口地址
            </el-button>
          </div>
          <div class="proxy-url" style="margin-top: 20px;">
            <span style="color: #909399; font-size: 14px;">代理接口地址：</span>
            <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px;">
              {{ proxyUrl }}
            </code>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getAccountStats, refreshAllBalance } from '@/api/account'
import { getLogStats } from '@/api/log'
import { ElMessage } from 'element-plus'
import { Wallet, User, CircleCheck, CircleClose } from '@element-plus/icons-vue'

const stats = reactive({
  totalBalance: 0,
  totalCount: 0,
  activeCount: 0,
  inactiveCount: 0
})

const logStats = reactive({
  totalRequests: 0,
  successRequests: 0,
  failRequests: 0,
  todayRequests: 0,
  todaySuccess: 0,
  successRate: 0
})

const refreshing = ref(false)
const proxyUrl = ref(`${window.location.origin}/proxy/get?duration=1&format=txt`)

const loadStats = async () => {
  try {
    const res = await getAccountStats()
    Object.assign(stats, res.data)
  } catch (error) {
    // 错误已处理
  }
}

const loadLogStats = async () => {
  try {
    const res = await getLogStats()
    Object.assign(logStats, res.data)
  } catch (error) {
    // 错误已处理
  }
}

const handleRefreshBalance = async () => {
  refreshing.value = true
  try {
    await refreshAllBalance()
    ElMessage.success('已开始刷新余额，请稍后刷新页面查看')
  } catch (error) {
    // 错误已处理
  } finally {
    refreshing.value = false
  }
}

const copyProxyUrl = () => {
  navigator.clipboard.writeText(proxyUrl.value)
  ElMessage.success('已复制到剪贴板')
}

onMounted(() => {
  loadStats()
  loadLogStats()
})
</script>

<style scoped>
.dashboard {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.stat-cards {
  margin-bottom: 20px;
  flex-shrink: 0;
}

.stat-card {
  display: flex;
  align-items: center;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.stat-info {
  margin-left: 16px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.log-stats {
  flex: 1;
}

.log-stats .el-col {
  height: 100%;
}

.log-stats .el-card {
  height: 100%;
}

.quick-actions {
  display: flex;
  gap: 12px;
}
</style>
