<template>
  <div class="dashboard-compare-page">
    <a-alert class="compare-alert" type="info" show-icon>
      首页暂时保留旧统计口径，这个页面只用于核对旧日志统计与新统计方案的差异。
    </a-alert>

    <div class="toolbar-section">
      <a-space>
        <a-radio-group v-model="chartType" type="button" size="small" @change="loadChartData">
          <a-radio value="today">今日</a-radio>
          <a-radio value="yesterday">昨日</a-radio>
          <a-radio value="week">本周</a-radio>
          <a-radio value="month">本月</a-radio>
        </a-radio-group>
        <a-button type="primary" size="small" :loading="loadingOverview || loadingChart" @click="reloadAll">
          刷新核对
        </a-button>
      </a-space>
    </div>

    <a-row :gutter="16" class="compare-cards">
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card :loading="loadingOverview" hoverable>
          <div class="compare-card">
            <div class="compare-label">总请求数</div>
            <div class="compare-main">{{ formatInteger(oldOverview.totalRequests) }}</div>
            <div class="compare-sub">新口径 {{ formatInteger(newOverview.totalRequests) }}</div>
            <div class="compare-diff" :class="getDiffClass(requestsDiff)">
              差值 {{ formatSignedInteger(requestsDiff) }}
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card :loading="loadingOverview" hoverable>
          <div class="compare-card">
            <div class="compare-label">总消费</div>
            <div class="compare-main">¥{{ formatCost(oldOverview.totalCost) }}</div>
            <div class="compare-sub">新口径 ¥{{ formatCost(newOverview.totalCost) }}</div>
            <div class="compare-diff" :class="getDiffClass(costDiff)">
              差值 {{ formatSignedCost(costDiff) }}
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card :loading="loadingChart" hoverable>
          <div class="compare-card">
            <div class="compare-label">{{ chartTypeLabel }}请求总计</div>
            <div class="compare-main">{{ formatInteger(chartOldSummary.requests) }}</div>
            <div class="compare-sub">新口径 {{ formatInteger(chartNewSummary.requests) }}</div>
            <div class="compare-diff" :class="getDiffClass(chartRequestsDiff)">
              差值 {{ formatSignedInteger(chartRequestsDiff) }}
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card :loading="loadingChart" hoverable>
          <div class="compare-card">
            <div class="compare-label">{{ chartTypeLabel }}消费总计</div>
            <div class="compare-main">¥{{ formatCost(chartOldSummary.cost) }}</div>
            <div class="compare-sub">新口径 ¥{{ formatCost(chartNewSummary.cost) }}</div>
            <div class="compare-diff" :class="getDiffClass(chartCostDiff)">
              差值 {{ formatSignedCost(chartCostDiff) }}
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-card class="chart-card" :loading="loadingChart">
      <template #title>
        <div class="card-title">图表核对</div>
      </template>
      <div ref="chartRef" class="chart-container"></div>
    </a-card>

    <a-card class="table-card" :loading="loadingChart">
      <template #title>
        <div class="card-title">明细核对</div>
      </template>
      <a-table :columns="columns" :data="compareRows" :pagination="false" :scroll="{ x: 900 }" row-key="date">
        <template #date="{ record }">
          {{ formatDateLabel(record.date) }}
        </template>
        <template #oldRequests="{ record }">
          {{ formatInteger(record.oldRequests) }}
        </template>
        <template #newRequests="{ record }">
          {{ formatInteger(record.newRequests) }}
        </template>
        <template #requestDiff="{ record }">
          <span :class="getDiffClass(record.requestDiff)">{{ formatSignedInteger(record.requestDiff) }}</span>
        </template>
        <template #oldCost="{ record }">
          ¥{{ formatCost(record.oldCost) }}
        </template>
        <template #newCost="{ record }">
          ¥{{ formatCost(record.newCost) }}
        </template>
        <template #costDiff="{ record }">
          <span :class="getDiffClass(record.costDiff)">{{ formatSignedCost(record.costDiff) }}</span>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import * as echarts from 'echarts'
import { getLogChart, getLogStats } from '@/api/log'
import { getDashboardChartNew, getStatsOverviewNew } from '@/api/statsSnapshot'

const chartType = ref('week')
const loadingOverview = ref(false)
const loadingChart = ref(false)
const chartRef = ref(null)

const oldOverview = reactive({
  totalRequests: 0,
  totalCost: 0
})

const newOverview = reactive({
  totalRequests: 0,
  totalCost: 0
})

const oldChartData = ref([])
const newChartData = ref([])

const chartTypeLabelMap = {
  today: '今日',
  yesterday: '昨日',
  week: '本周',
  month: '本月'
}

const chartTypeLabel = computed(() => chartTypeLabelMap[chartType.value] || '当前')
const requestsDiff = computed(() => newOverview.totalRequests - oldOverview.totalRequests)
const costDiff = computed(() => Number((newOverview.totalCost - oldOverview.totalCost).toFixed(4)))

const sumChartMetrics = (list) => list.reduce((summary, item) => {
  summary.requests += Number(item.requests || 0)
  summary.cost += Number(item.cost || 0)
  return summary
}, { requests: 0, cost: 0 })

const chartOldSummary = computed(() => sumChartMetrics(oldChartData.value))
const chartNewSummary = computed(() => sumChartMetrics(newChartData.value))
const chartRequestsDiff = computed(() => chartNewSummary.value.requests - chartOldSummary.value.requests)
const chartCostDiff = computed(() => Number((chartNewSummary.value.cost - chartOldSummary.value.cost).toFixed(4)))

const compareRows = computed(() => {
  const oldMap = {}
  const newMap = {}

  oldChartData.value.forEach((item) => {
    oldMap[item.date] = item
  })

  newChartData.value.forEach((item) => {
    newMap[item.date] = item
  })

  const allDates = [...new Set([...Object.keys(oldMap), ...Object.keys(newMap)])].sort()

  return allDates.map((date) => {
    const oldItem = oldMap[date] || {}
    const newItem = newMap[date] || {}
    const oldRequests = Number(oldItem.requests || 0)
    const newRequests = Number(newItem.requests || 0)
    const oldCost = Number(oldItem.cost || 0)
    const newCost = Number(newItem.cost || 0)

    return {
      date,
      oldRequests,
      newRequests,
      requestDiff: newRequests - oldRequests,
      oldCost,
      newCost,
      costDiff: Number((newCost - oldCost).toFixed(4))
    }
  })
})

const columns = [
  { title: '日期', dataIndex: 'date', slotName: 'date', width: 100 },
  { title: '旧请求数', dataIndex: 'oldRequests', slotName: 'oldRequests', width: 120 },
  { title: '新请求数', dataIndex: 'newRequests', slotName: 'newRequests', width: 120 },
  { title: '请求差值', dataIndex: 'requestDiff', slotName: 'requestDiff', width: 120 },
  { title: '旧消费', dataIndex: 'oldCost', slotName: 'oldCost', width: 140 },
  { title: '新消费', dataIndex: 'newCost', slotName: 'newCost', width: 140 },
  { title: '消费差值', dataIndex: 'costDiff', slotName: 'costDiff', width: 140 }
]

const formatInteger = (value) => Number(value || 0).toLocaleString()
const formatCost = (value) => Number(value || 0).toFixed(4)
const formatSignedInteger = (value) => `${value > 0 ? '+' : ''}${Number(value || 0).toLocaleString()}`
const formatSignedCost = (value) => `${value > 0 ? '+' : ''}¥${Number(value || 0).toFixed(4)}`

const formatDateLabel = (dateStr) => {
  const parts = String(dateStr || '').split('-')
  if (parts.length !== 3) {
    return dateStr
  }
  return `${parts[1]}/${parts[2]}`
}

const getDiffClass = (value) => {
  if (value > 0) {
    return 'diff-up'
  }
  if (value < 0) {
    return 'diff-down'
  }
  return 'diff-flat'
}

let chartInstance = null

const renderChart = () => {
  if (!chartRef.value) {
    return
  }

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }

  const rows = compareRows.value
  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      top: 0,
      data: ['旧请求数', '新请求数', '旧消费', '新消费']
    },
    grid: {
      left: 50,
      right: 60,
      top: 48,
      bottom: 24
    },
    xAxis: {
      type: 'category',
      data: rows.map((item) => formatDateLabel(item.date))
    },
    yAxis: [
      {
        type: 'value',
        name: '请求数'
      },
      {
        type: 'value',
        name: '消费',
        axisLabel: {
          formatter: (value) => `¥${Number(value).toFixed(2)}`
        }
      }
    ],
    series: [
      {
        name: '旧请求数',
        type: 'bar',
        data: rows.map((item) => item.oldRequests),
        itemStyle: { color: '#165dff' }
      },
      {
        name: '新请求数',
        type: 'line',
        data: rows.map((item) => item.newRequests),
        smooth: true,
        itemStyle: { color: '#00b42a' }
      },
      {
        name: '旧消费',
        type: 'line',
        yAxisIndex: 1,
        data: rows.map((item) => item.oldCost),
        smooth: true,
        itemStyle: { color: '#ff7d00' }
      },
      {
        name: '新消费',
        type: 'line',
        yAxisIndex: 1,
        data: rows.map((item) => item.newCost),
        smooth: true,
        lineStyle: { type: 'dashed' },
        itemStyle: { color: '#722ed1' }
      }
    ]
  }

  chartInstance.setOption(option)
}

const loadOverview = async () => {
  loadingOverview.value = true
  try {
    const [oldRes, newRes] = await Promise.all([
      getLogStats(),
      getStatsOverviewNew()
    ])

    Object.assign(oldOverview, {
      totalRequests: Number(oldRes.data?.totalRequests || 0),
      totalCost: Number(oldRes.data?.totalCost || 0)
    })

    Object.assign(newOverview, {
      totalRequests: Number(newRes.data?.total?.requests || 0),
      totalCost: Number(newRes.data?.total?.cost || 0)
    })
  } finally {
    loadingOverview.value = false
  }
}

const loadChartData = async () => {
  loadingChart.value = true
  try {
    const [oldRes, newRes] = await Promise.all([
      getLogChart({ type: chartType.value }),
      getDashboardChartNew({ type: chartType.value })
    ])

    oldChartData.value = oldRes.data || []
    newChartData.value = newRes.data || []
    await nextTick()
    renderChart()
  } finally {
    loadingChart.value = false
  }
}

const reloadAll = async () => {
  await Promise.all([loadOverview(), loadChartData()])
}

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize()
  }
}

onMounted(async () => {
  await reloadAll()
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
.dashboard-compare-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.compare-alert,
.toolbar-section,
.compare-cards,
.chart-card,
.table-card {
  flex-shrink: 0;
}

.compare-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compare-label {
  font-size: 14px;
  color: var(--color-text-2);
}

.compare-main {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.compare-sub {
  font-size: 14px;
  color: var(--color-text-2);
}

.compare-diff {
  font-size: 13px;
  font-weight: 500;
}

.diff-up {
  color: #f53f3f;
}

.diff-down {
  color: #00b42a;
}

.diff-flat {
  color: var(--color-text-3);
}

.card-title {
  font-weight: 600;
}

.chart-card :deep(.arco-card-body) {
  padding: 12px;
}

.chart-container {
  width: 100%;
  height: 360px;
}

.table-card :deep(.arco-card-body) {
  padding: 12px;
}

@media (max-width: 768px) {
  .chart-container {
    height: 300px;
  }
}
</style>
