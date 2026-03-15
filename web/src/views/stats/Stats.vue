<template>
  <div class="stats-page">
    <!-- 概览卡片 -->
    <a-row :gutter="16" class="overview-cards">
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-statistic title="今日请求" :value="overview.today.requests" :show-group-separator="true">
            <template #suffix>
              <span class="stat-suffix">次</span>
              <span v-if="overview.yesterday.requests > 0" class="stat-compare-inline" :class="overview.today.requests >= overview.yesterday.requests ? 'up' : 'down'">
                {{ overview.today.requests >= overview.yesterday.requests ? '↑' : '↓' }}{{ Math.abs(overview.today.requests - overview.yesterday.requests) }}
              </span>
            </template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-statistic title="今日成功" :value="overview.today.successCount" :show-group-separator="true">
            <template #suffix>
              <span class="stat-suffix">次</span>
              <span class="stat-rate-inline">
                {{ overview.today.requests > 0 ? ((overview.today.successCount / overview.today.requests) * 100).toFixed(1) : 0 }}%
              </span>
            </template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-statistic title="今日消费" :value="overview.today.cost" :precision="4" :show-group-separator="true">
            <template #prefix>¥</template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-statistic title="本周请求" :value="overview.week.requests" :show-group-separator="true">
            <template #suffix>
              <span class="stat-suffix">次</span>
            </template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-statistic title="本月请求" :value="overview.month.requests" :show-group-separator="true">
            <template #suffix>
              <span class="stat-suffix">次</span>
            </template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-statistic title="累计请求" :value="overview.total.requests" :show-group-separator="true">
            <template #suffix>
              <span class="stat-suffix">次</span>
            </template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <!-- 时间范围选择 + 图表 -->
    <a-row :gutter="16" class="chart-row">
      <a-col :xs="24" :lg="16">
        <a-card hoverable class="chart-card">
          <template #title>
            <div class="card-header">
              <span>请求趋势</span>
            </div>
          </template>
          <template #extra>
            <a-radio-group v-model="chartType" size="small" type="button" @change="loadHourlyData">
              <a-radio value="today">今日</a-radio>
              <a-radio value="week">本周</a-radio>
              <a-radio value="month">本月</a-radio>
            </a-radio-group>
          </template>
          <div ref="hourlyChartRef" class="chart-container"></div>
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="8">
        <a-card hoverable class="chart-card site-chart-card">
          <template #title>
            <div class="card-header">
              <span>网站请求分布</span>
            </div>
          </template>
          <template #extra>
            <a-radio-group v-model="siteType" size="small" type="button" @change="loadSiteData">
              <a-radio value="today">今日</a-radio>
              <a-radio value="week">本周</a-radio>
              <a-radio value="month">本月</a-radio>
            </a-radio-group>
          </template>
          <div ref="siteChartRef" class="chart-container"></div>
        </a-card>
      </a-col>
    </a-row>

    <!-- 排行榜 -->
    <a-row :gutter="16" class="ranking-row">
      <a-col :xs="24" :lg="12">
        <a-card hoverable class="ranking-card">
          <template #title>
            <div class="card-header">
              <span>成功排行</span>
            </div>
          </template>
          <template #extra>
            <a-radio-group v-model="successType" size="small" type="button" @change="loadSuccessRanking">
              <a-radio value="today">今日</a-radio>
              <a-radio value="week">本周</a-radio>
              <a-radio value="month">本月</a-radio>
            </a-radio-group>
          </template>
          <a-table :data="successRanking" :pagination="false" :bordered="false" size="small">
            <template #columns>
              <a-table-column title="排名" :width="60" align="center">
                <template #cell="{ rowIndex }">
                  <a-tag :color="rowIndex < 3 ? ['gold', 'silver', '#cd7f32'][rowIndex] : 'gray'" size="small">
                    {{ rowIndex + 1 }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column title="账号" data-index="accountName" :ellipsis="true" :tooltip="true" />
              <a-table-column title="网站" data-index="siteName" :width="100" :ellipsis="true" :tooltip="true" />
              <a-table-column title="成功数" data-index="successCount" :width="80" align="right">
                <template #cell="{ record }">
                  <span class="success-num">{{ record.successCount }}</span>
                </template>
              </a-table-column>
              <a-table-column title="成功率" :width="80" align="right">
                <template #cell="{ record }">
                  <span :class="parseFloat(record.successRate) >= 90 ? 'rate-good' : parseFloat(record.successRate) >= 70 ? 'rate-normal' : 'rate-bad'">
                    {{ record.successRate }}%
                  </span>
                </template>
              </a-table-column>
            </template>
          </a-table>
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="12">
        <a-card hoverable class="ranking-card">
          <template #title>
            <div class="card-header">
              <span>失败排行</span>
            </div>
          </template>
          <template #extra>
            <a-radio-group v-model="failType" size="small" type="button" @change="loadFailRanking">
              <a-radio value="today">今日</a-radio>
              <a-radio value="week">本周</a-radio>
              <a-radio value="month">本月</a-radio>
            </a-radio-group>
          </template>
          <a-table :data="failRanking" :pagination="false" :bordered="false" size="small">
            <template #columns>
              <a-table-column title="排名" :width="60" align="center">
                <template #cell="{ rowIndex }">
                  <span class="fail-rank">{{ rowIndex + 1 }}</span>
                </template>
              </a-table-column>
              <a-table-column title="账号" data-index="accountName" :ellipsis="true" :tooltip="true" />
              <a-table-column title="请求数" data-index="totalRequests" :width="80" align="right" />
              <a-table-column title="失败数" data-index="failCount" :width="80" align="right">
                <template #cell="{ record }">
                  <span class="fail-num">{{ record.failCount }}</span>
                </template>
              </a-table-column>
              <a-table-column title="连续失败" :width="80" align="right">
                <template #cell="{ record }">
                  <a-tag v-if="record.currentFailCount >= 3" color="red" size="small">
                    {{ record.currentFailCount }}
                  </a-tag>
                  <span v-else>{{ record.currentFailCount }}</span>
                </template>
              </a-table-column>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>

    <!-- 异常监控 -->
    <a-row :gutter="16" class="monitor-row">
      <a-col :xs="24" :lg="8">
        <a-card hoverable class="monitor-card">
          <template #title>
            <div class="card-header">
              <icon-exclamation-circle-fill class="warning-icon" />
              <span>异常账号 (连续失败≥3)</span>
            </div>
          </template>
          <div v-if="abnormalAccounts.length === 0" class="empty-tip">
            <icon-check-circle-fill class="success-icon" />
            <span>暂无异常账号</span>
          </div>
          <div v-else class="monitor-list">
            <div v-for="item in abnormalAccounts" :key="item.id" class="monitor-item">
              <div class="item-info">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-site">{{ item.siteName }}</span>
              </div>
              <a-tag color="red">连续失败 {{ item.failCount }} 次</a-tag>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="8">
        <a-card hoverable class="monitor-card">
          <template #title>
            <div class="card-header">
              <icon-exclamation-polygon-fill class="warning-icon" />
              <span>低余额账号 (&lt;10元)</span>
            </div>
          </template>
          <div v-if="lowBalanceAccounts.length === 0" class="empty-tip">
            <icon-check-circle-fill class="success-icon" />
            <span>暂无低余额账号</span>
          </div>
          <div v-else class="monitor-list">
            <div v-for="item in lowBalanceAccounts" :key="item.id" class="monitor-item">
              <div class="item-info">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-site">{{ item.siteName }}</span>
              </div>
              <span class="balance-low">¥{{ item.balance.toFixed(2) }}</span>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="8">
        <a-card hoverable class="monitor-card">
          <template #title>
            <div class="card-header">
              <icon-exclamation-circle-fill class="warning-icon" />
              <span>即将过期账号 (7天内)</span>
            </div>
          </template>
          <div v-if="expiringAccounts.length === 0" class="empty-tip">
            <icon-check-circle-fill class="success-icon" />
            <span>暂无即将过期账号</span>
          </div>
          <div v-else class="monitor-list">
            <div v-for="item in expiringAccounts" :key="item.id" class="monitor-item">
              <div class="item-info">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-site">{{ item.siteName }}</span>
              </div>
              <a-tag :color="item.daysLeft <= 3 ? 'red' : 'orange'">
                {{ item.daysLeft }} 天后过期
              </a-tag>
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import {
  getStatsOverview,
  getAccountSuccessRanking,
  getAccountFailRanking,
  getSiteDistribution,
  getHourlyDistribution,
  getAbnormalAccounts,
  getLowBalanceAccounts,
  getExpiringAccounts
} from '@/api/stats'
import {
  IconExclamationCircleFill,
  IconExclamationPolygonFill,
  IconCheckCircleFill
} from '@arco-design/web-vue/es/icon'
import * as echarts from 'echarts'

// 概览数据
const overview = reactive({
  today: { requests: 0, successCount: 0, cost: 0 },
  yesterday: { requests: 0, successCount: 0, cost: 0 },
  week: { requests: 0, successCount: 0, cost: 0 },
  month: { requests: 0, successCount: 0, cost: 0 },
  total: { requests: 0, successCount: 0, cost: 0 },
  accounts: { total: 0, active: 0, abnormal: 0, lowBalance: 0 }
})

// 图表类型
const chartType = ref('today')
const siteType = ref('today')
const successType = ref('today')
const failType = ref('today')

// 排行数据
const successRanking = ref([])
const failRanking = ref([])

// 异常监控数据
const abnormalAccounts = ref([])
const lowBalanceAccounts = ref([])
const expiringAccounts = ref([])

// 图表引用
const hourlyChartRef = ref(null)
const siteChartRef = ref(null)
let hourlyChart = null
let siteChart = null

// 加载概览数据
const loadOverview = async () => {
  try {
    const res = await getStatsOverview()
    Object.assign(overview, res.data)
  } catch (error) {
    console.error('加载概览数据失败:', error)
  }
}

// 加载成功排行
const loadSuccessRanking = async () => {
  try {
    const res = await getAccountSuccessRanking({ type: successType.value, limit: 10 })
    successRanking.value = res.data
  } catch (error) {
    console.error('加载成功排行失败:', error)
  }
}

// 加载失败排行
const loadFailRanking = async () => {
  try {
    const res = await getAccountFailRanking({ type: failType.value, limit: 10 })
    failRanking.value = res.data
  } catch (error) {
    console.error('加载失败排行失败:', error)
  }
}

// 加载网站分布
const loadSiteData = async () => {
  try {
    const res = await getSiteDistribution({ type: siteType.value })
    renderSiteChart(res.data)
  } catch (error) {
    console.error('加载网站分布失败:', error)
  }
}

// 加载每小时分布
const loadHourlyData = async () => {
  try {
    const res = await getHourlyDistribution({ type: chartType.value })
    renderHourlyChart(res.data)
  } catch (error) {
    console.error('加载小时分布失败:', error)
  }
}

// 加载异常账号
const loadAbnormalAccounts = async () => {
  try {
    const res = await getAbnormalAccounts()
    abnormalAccounts.value = res.data
  } catch (error) {
    console.error('加载异常账号失败:', error)
  }
}

// 加载低余额账号
const loadLowBalanceAccounts = async () => {
  try {
    const res = await getLowBalanceAccounts({ threshold: 10 })
    lowBalanceAccounts.value = res.data
  } catch (error) {
    console.error('加载低余额账号失败:', error)
  }
}

// 加载即将过期账号
const loadExpiringAccounts = async () => {
  try {
    const res = await getExpiringAccounts({ days: 7 })
    expiringAccounts.value = res.data
  } catch (error) {
    console.error('加载即将过期账号失败:', error)
  }
}

// 渲染小时分布图表
const renderHourlyChart = (data) => {
  if (!hourlyChartRef.value) return

  if (!hourlyChart) {
    hourlyChart = echarts.init(hourlyChartRef.value)
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['请求数', '成功数'],
      bottom: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d.label),
      axisLabel: {
        interval: chartType.value === 'today' ? 2 : 3
      }
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: '请求数',
        type: 'bar',
        data: data.map(d => d.requests),
        itemStyle: { color: '#165DFF' }
      },
      {
        name: '成功数',
        type: 'bar',
        data: data.map(d => d.successCount),
        itemStyle: { color: '#00B42A' }
      }
    ]
  }

  hourlyChart.setOption(option)
}

// 渲染网站分布图表
const renderSiteChart = (data) => {
  if (!siteChartRef.value) return

  if (!siteChart) {
    siteChart = echarts.init(siteChartRef.value)
  }

  const chartData = data.slice(0, 8).map(d => ({
    name: d.siteName,
    value: d.totalRequests
  }))

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      right: 10,
      top: 20,
      bottom: 20
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: false
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold'
          }
        },
        data: chartData
      }
    ]
  }

  siteChart.setOption(option)
}

// 窗口大小变化
const handleResize = () => {
  hourlyChart?.resize()
  siteChart?.resize()
}

onMounted(async () => {
  await Promise.all([
    loadOverview(),
    loadSuccessRanking(),
    loadFailRanking(),
    loadAbnormalAccounts(),
    loadLowBalanceAccounts(),
    loadExpiringAccounts()
  ])

  await nextTick()
  loadHourlyData()
  loadSiteData()

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  hourlyChart?.dispose()
  siteChart?.dispose()
})
</script>

<style scoped>
.stats-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
}

.overview-cards {
  flex-shrink: 0;
}

.stat-card {
  height: 100%;
}

.stat-card :deep(.arco-card-body) {
  padding: 16px;
}

.stat-suffix {
  font-size: 14px;
  color: var(--color-text-3);
}

.stat-compare-inline {
  margin-left: 8px;
  font-size: 12px;
  font-weight: normal;
}

.stat-compare-inline.up {
  color: #00B42A;
}

.stat-compare-inline.down {
  color: #F53F3F;
}

.stat-rate-inline {
  margin-left: 8px;
  font-size: 12px;
  font-weight: normal;
  color: var(--color-text-3);
}

.chart-row,
.ranking-row,
.monitor-row {
  flex-shrink: 0;
}

.chart-card {
  height: 100%;
  min-height: 300px;
  display: flex;
  flex-direction: column;
}

.chart-card :deep(.arco-card-body) {
  flex: 1;
  min-height: 0;
  padding: 12px;
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 240px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ranking-card :deep(.arco-card-body) {
  padding: 12px;
}

.success-num {
  color: #00B42A;
  font-weight: 500;
}

.fail-num {
  color: #F53F3F;
  font-weight: 500;
}

.fail-rank {
  color: #F53F3F;
}

.rate-good {
  color: #00B42A;
}

.rate-normal {
  color: #FF7D00;
}

.rate-bad {
  color: #F53F3F;
}

.monitor-card {
  height: 100%;
}

.monitor-card :deep(.arco-card-body) {
  padding: 12px;
  max-height: 250px;
  overflow-y: auto;
}

.warning-icon {
  color: #FF7D00;
  margin-right: 4px;
}

.success-icon {
  color: #00B42A;
  margin-right: 4px;
}

.empty-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--color-text-3);
}

.monitor-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.monitor-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--color-fill-1);
  border-radius: 4px;
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.item-name {
  font-weight: 500;
  color: var(--color-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-site {
  font-size: 12px;
  color: var(--color-text-3);
}

.balance-low {
  color: #F53F3F;
  font-weight: 500;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .overview-cards :deep(.arco-col) {
    margin-bottom: 8px;
  }

  .chart-row :deep(.arco-col),
  .ranking-row :deep(.arco-col),
  .monitor-row :deep(.arco-col) {
    margin-bottom: 16px;
  }

  .chart-card {
    min-height: 250px;
  }

  .chart-container {
    min-height: 200px;
  }
}
</style>
