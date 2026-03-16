<template>
  <div class="dashboard">
    <!-- 统计卡片 - 第一行 -->
    <a-row :gutter="16" class="stat-cards">
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card-wrap">
          <div class="stat-card">
            <div class="stat-icon" style="background: #165DFF">
              <icon-code-square :size="20" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totalBalance.toFixed(2) }}</div>
              <div class="stat-label">总余额</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card-wrap">
          <div class="stat-card">
            <div class="stat-icon" style="background: #00B42A">
              <icon-user :size="20" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totalCount }}</div>
              <div class="stat-label">总账号数</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card-wrap">
          <div class="stat-card">
            <div class="stat-icon" style="background: #FF7D00">
              <icon-check-circle :size="20" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.activeCount }}</div>
              <div class="stat-label">启用账号</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card-wrap">
          <div class="stat-card">
            <div class="stat-icon" style="background: #F53F3F">
              <icon-close-circle :size="20" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.inactiveCount }}</div>
              <div class="stat-label">禁用账号</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card-wrap">
          <div class="stat-card">
            <div class="stat-icon" style="background: #86909C">
              <icon-storage :size="20" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ logStats.totalRequests }}</div>
              <div class="stat-label">总请求数</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card-wrap">
          <div class="stat-card">
            <div class="stat-icon" style="background: #9C27B0">
              <icon-fire :size="20" />
            </div>
            <div class="stat-info">
              <div class="stat-value">¥{{ Number(logStats.totalCost || 0).toFixed(4) }}</div>
              <div class="stat-label">总消费</div>
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <!-- 快捷操作 -->
    <div class="quick-actions-bar">
      <div class="action-buttons">
        <a-button type="primary" size="small" @click="handleRefreshBalance" :loading="refreshing">
          刷新余额
        </a-button>
        <a-button size="small" @click="copyProxyUrl">
          复制接口
        </a-button>
      </div>
      <span class="proxy-url">
        <span class="proxy-label">代理接口：</span>
        <code>
          <span v-if="showDomain">{{ proxyUrl }}</span>
          <span v-else>{{ maskedProxyUrl }}</span>
        </code>
        <a-button type="text" size="mini" class="toggle-visibility" @click="showDomain = !showDomain">
          <template #icon>
            <icon-eye v-if="!showDomain" />
            <icon-eye-invisible v-else />
          </template>
        </a-button>
      </span>
    </div>

    <!-- 图表区域 -->
    <a-card hoverable class="chart-card">
      <template #title>
        <div class="chart-header">
          <div class="chart-title">
            <span>请求统计</span>
            <span class="chart-summary">
              总计: {{ chartSummary.requests }} 次请求 | {{ chartSummary.success }} 次成功 | ¥{{ chartSummary.cost.toFixed(4) }} 消费
            </span>
          </div>
        </div>
      </template>
      <template #extra>
        <a-radio-group v-model="chartType" size="small" type="button" @change="loadChartData">
          <a-radio value="today">今日</a-radio>
          <a-radio value="yesterday">昨日</a-radio>
          <a-radio value="week">本周</a-radio>
          <a-radio value="month">本月</a-radio>
        </a-radio-group>
      </template>
      <div ref="chartRef" class="chart-container"></div>
    </a-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { getAccountStats, refreshAllBalance } from '@/api/account'
import { getLogChart, getLogStats } from '@/api/log'
import { Message } from '@arco-design/web-vue'
import {
  IconCodeSquare,
  IconUser,
  IconCheckCircle,
  IconCloseCircle,
  IconStorage,
  IconFire,
  IconEye,
  IconEyeInvisible
} from '@arco-design/web-vue/es/icon'
import * as echarts from 'echarts'

const stats = reactive({
  totalBalance: 0,
  totalCount: 0,
  activeCount: 0,
  inactiveCount: 0
})

const logStats = reactive({
  totalRequests: 0,
  totalCost: 0
})

const chartData = ref([])
const chartSummary = computed(() => {
  const summary = { requests: 0, success: 0, cost: 0 }
  chartData.value.forEach(item => {
    summary.requests += item.requests
    summary.success += item.successCount
    summary.cost += item.cost
  })
  return summary
})

const refreshing = ref(false)
const proxyUrl = ref(`${window.location.origin}/api/proxy/get?times=1&format=txt`)
const showDomain = ref(false)
const chartType = ref('week')
const chartRef = ref(null)
let chartInstance = null

// 隐藏域名的代理地址
const maskedProxyUrl = computed(() => {
  try {
    const url = new URL(proxyUrl.value)
    const host = url.host
    const maskedHost = host.length > 8
      ? host.slice(0, 4) + '****' + host.slice(-4)
      : '****'
    return proxyUrl.value.replace(host, maskedHost)
  } catch {
    return '****/api/proxy/get?times=1&format=txt'
  }
})

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
    chartData.value = res.data
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
          color: '#165DFF'
        }
      },
      {
        name: '成功数',
        type: 'bar',
        data: successCount,
        itemStyle: {
          color: '#00B42A'
        }
      },
      {
        name: '消费金额',
        type: 'line',
        yAxisIndex: 1,
        data: costs,
        itemStyle: {
          color: '#FF7D00'
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
    Message.success('已开始刷新余额，请稍后刷新页面查看')
  } catch (error) {
    // 错误已处理
  } finally {
    refreshing.value = false
  }
}

const copyProxyUrl = async () => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(proxyUrl.value)
    } else {
      // 兼容非 HTTPS 环境
      const textArea = document.createElement('textarea')
      textArea.value = proxyUrl.value
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
    Message.success('已复制到剪贴板')
  } catch (error) {
    Message.error('复制失败，请手动复制')
  }
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
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
}

.stat-cards {
  flex-shrink: 0;
}

.stat-card-wrap {
  height: 100%;
}

.stat-card-wrap :deep(.arco-card-body) {
  padding: 12px 16px;
}

.stat-card {
  display: flex;
  align-items: center;
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.stat-info {
  margin-left: 12px;
  min-width: 0;
  flex: 1;
}

.stat-value {
  font-size: 18px;
  font-weight: bold;
  color: var(--color-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-3);
  margin-top: 2px;
}

.quick-actions-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.quick-actions-bar .proxy-url {
  margin-left: auto;
  color: var(--color-text-3);
  font-size: 14px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.quick-actions-bar .proxy-label {
  white-space: nowrap;
}

.quick-actions-bar .proxy-url code {
  background: var(--color-fill-2);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--color-text-2);
  word-break: break-all;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.quick-actions-bar .toggle-visibility {
  padding: 2px;
  margin-left: 4px;
}

.quick-actions-bar .toggle-visibility :deep(.arco-icon) {
  font-size: 14px;
}

.chart-card {
  height: 100%;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.chart-card :deep(.arco-card-body) {
  flex: 1;
  min-height: 0;
  padding: 16px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.chart-title {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.chart-summary {
  font-size: 13px;
  color: var(--color-text-3);
  font-weight: normal;
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 240px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .stat-cards {
    margin: 0 -4px;
  }

  .stat-cards :deep(.arco-col) {
    margin-bottom: 8px;
  }

  .stat-card-wrap :deep(.arco-card-body) {
    padding: 10px 12px;
  }

  .stat-icon {
    width: 36px;
    height: 36px;
  }

  .stat-value {
    font-size: 16px;
  }

  .stat-label {
    font-size: 11px;
  }

  .quick-actions-bar {
    padding: 10px 12px;
    gap: 8px;
  }

  .action-buttons {
    width: 100%;
  }

  .action-buttons :deep(.arco-btn) {
    flex: 1;
  }

  .quick-actions-bar .proxy-url {
    width: 100%;
    margin-left: 0;
    font-size: 12px;
  }

  .quick-actions-bar .proxy-url code {
    font-size: 11px;
    padding: 2px 6px;
  }

  /* 图表卡片移动端 */
  .chart-card {
    min-height: auto;
    height: auto;
  }

  .chart-card :deep(.arco-card-header) {
    flex-direction: column;
    align-items: flex-start;
    height: auto;
    padding: 12px 16px;
    gap: 8px;
  }

  .chart-card :deep(.arco-card-header-extra) {
    position: static;
    width: 100%;
  }

  .chart-card :deep(.arco-card-body) {
    height: auto;
    min-height: 300px;
    overflow-x: auto;
  }

  .chart-header {
    width: 100%;
  }

  .chart-title {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;
  }

  .chart-title > span:first-child {
    font-weight: 600;
    flex-shrink: 0;
  }

  .chart-summary {
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .chart-container {
    min-height: 300px;
    width: 100%;
  }

  :deep(.arco-radio-group) {
    width: 100%;
  }

  :deep(.arco-radio-button) {
    flex: 1;
  }
}
</style>
