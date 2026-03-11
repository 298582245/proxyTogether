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

    <!-- 快捷操作 -->
    <el-card shadow="hover" class="action-card">
      <div class="quick-actions">
        <el-button type="primary" @click="handleRefreshBalance" :loading="refreshing">
          刷新所有余额
        </el-button>
        <el-button @click="copyProxyUrl">
          复制代理接口地址
        </el-button>
        <div class="proxy-url">
          <span style="color: #909399; font-size: 14px;">代理接口：</span>
          <code>{{ proxyUrl }}</code>
        </div>
      </div>
    </el-card>

    <!-- 图表区域 -->
    <el-card shadow="hover" class="chart-card">
      <template #header>
        <div class="chart-header">
          <span>请求统计</span>
          <el-radio-group v-model="chartType" size="small" @change="loadChartData">
            <el-radio-button value="today">今日</el-radio-button>
            <el-radio-button value="yesterday">昨日</el-radio-button>
            <el-radio-button value="week">本周</el-radio-button>
            <el-radio-button value="month">本月</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <div ref="chartRef" class="chart-container"></div>
    </el-card>

    <!-- 统计对比 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <span>今日统计</span>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="请求数">{{ logStats.todayRequests }}</el-descriptions-item>
            <el-descriptions-item label="成功数">{{ logStats.todaySuccess }}</el-descriptions-item>
            <el-descriptions-item label="消费">¥{{ Number(logStats.todayCost || 0).toFixed(4) }}</el-descriptions-item>
            <el-descriptions-item label="成功率">{{ logStats.todayRequests > 0 ? ((logStats.todaySuccess / logStats.todayRequests) * 100).toFixed(1) : 0 }}%</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <span>昨日统计</span>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="请求数">{{ logStats.yesterdayRequests }}</el-descriptions-item>
            <el-descriptions-item label="成功数">{{ logStats.yesterdaySuccess }}</el-descriptions-item>
            <el-descriptions-item label="消费">¥{{ Number(logStats.yesterdayCost || 0).toFixed(4) }}</el-descriptions-item>
            <el-descriptions-item label="成功率">{{ logStats.yesterdayRequests > 0 ? ((logStats.yesterdaySuccess / logStats.yesterdayRequests) * 100).toFixed(1) : 0 }}%</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover" class="total-card">
      <template #header>
        <span>累计统计</span>
      </template>
      <el-descriptions :column="4" border>
        <el-descriptions-item label="总请求">{{ logStats.totalRequests }}</el-descriptions-item>
        <el-descriptions-item label="总成功">{{ logStats.successRequests }}</el-descriptions-item>
        <el-descriptions-item label="总消费">¥{{ Number(logStats.totalCost || 0).toFixed(4) }}</el-descriptions-item>
        <el-descriptions-item label="成功率">{{ logStats.successRate }}%</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { getAccountStats, refreshAllBalance } from '@/api/account'
import { getLogStats, getLogChart } from '@/api/log'
import { ElMessage } from 'element-plus'
import { Wallet, User, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import * as echarts from 'echarts'

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
  totalCost: 0,
  todayRequests: 0,
  todaySuccess: 0,
  todayCost: 0,
  yesterdayRequests: 0,
  yesterdaySuccess: 0,
  yesterdayCost: 0,
  successRate: 0
})

const refreshing = ref(false)
const proxyUrl = ref(`${window.location.origin}/api/proxy/get?times=1&format=txt`)
const chartType = ref('week')
const chartRef = ref(null)
let chartInstance = null

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

const loadChartData = async () => {
  try {
    const res = await getLogChart({ type: chartType.value })
    await nextTick()
    renderChart(res.data)
  } catch (error) {
    // 错误已处理
  }
}

const renderChart = (data) => {
  if (!chartRef.value) return

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }

  const dates = data.map(item => {
    const date = new Date(item.date)
    return `${date.getMonth() + 1}/${date.getDate()}`
  })
  const requests = data.map(item => item.requests)
  const successCount = data.map(item => item.successCount)
  const costs = data.map(item => item.cost)

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      }
    },
    legend: {
      data: ['请求数', '成功数', '消费金额']
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates
    },
    yAxis: [
      {
        type: 'value',
        name: '请求数',
        position: 'left'
      },
      {
        type: 'value',
        name: '消费(元)',
        position: 'right'
      }
    ],
    series: [
      {
        name: '请求数',
        type: 'bar',
        data: requests,
        itemStyle: {
          color: '#409EFF'
        }
      },
      {
        name: '成功数',
        type: 'bar',
        data: successCount,
        itemStyle: {
          color: '#67C23A'
        }
      },
      {
        name: '消费金额',
        type: 'line',
        yAxisIndex: 1,
        data: costs,
        itemStyle: {
          color: '#E6A23C'
        },
        smooth: true
      }
    ]
  }

  chartInstance.setOption(option)
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

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize()
  }
}

onMounted(() => {
  loadStats()
  loadLogStats()
  loadChartData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (chartInstance) {
    chartInstance.dispose()
  }
})
</script>

<style scoped>
.dashboard {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  overflow-y: auto;
}

.stat-cards {
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

.action-card {
  flex-shrink: 0;
}

.quick-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.proxy-url {
  margin-left: auto;
}

.proxy-url code {
  background: #f5f5f5;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
}

.chart-card {
  flex-shrink: 0;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-container {
  height: 300px;
}

.stats-row {
  flex-shrink: 0;
}

.total-card {
  flex-shrink: 0;
}
</style>
