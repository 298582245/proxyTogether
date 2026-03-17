<template>
  <div class="stats-snapshot-page">
    <!-- 筛选器区域 - 独立容器 -->
    <div class="filter-section">
      <a-card :bordered="false">
        <template #title>统计快照校验</template>

        <div class="toolbar-header">
          <div class="toolbar-summary-item">
            <span class="toolbar-summary-label">当前服务器时间</span>
            <span class="toolbar-summary-value">{{ formatDateTime(options.currentDateTime) }}</span>
          </div>
          <div class="toolbar-summary-item">
            <span class="toolbar-summary-label">最新日志时间</span>
            <span class="toolbar-summary-value">{{ formatDateTime(options.latestDateTime) }}</span>
          </div>
          <div class="toolbar-summary-item">
            <span class="toolbar-summary-label">可选日期数量</span>
            <span class="toolbar-summary-value">{{ options.availableDates.length }}</span>
          </div>
        </div>

        <div class="filters-grid">
          <div class="filter-item">
            <div class="filter-label">统计日期</div>
            <a-date-picker
              v-model="filters.statDate"
              class="filter-control"
              value-format="YYYY-MM-DD"
              format="YYYY-MM-DD"
              placeholder="请选择统计日期"
              :disabled-date="disableStatDate"
              @change="handleStatDateChange"
            />
          </div>

          <div class="filter-item">
            <div class="filter-label">统计时间点</div>
            <a-time-picker
              v-model="filters.statTime"
              class="filter-control"
              format="HH:mm:ss"
              value-format="HH:mm:ss"
              placeholder="请选择时间点"
              @change="handleStatTimeChange"
            />
          </div>

          <div class="filter-item">
            <div class="filter-label">对比月份</div>
            <a-select
              v-model="filters.compareMonth"
              class="filter-control"
              placeholder="请选择对比月份"
              @change="handleCompareMonthChange"
            >
              <a-option v-for="item in options.availableMonths" :key="item" :value="item">
                {{ item }}
              </a-option>
            </a-select>
          </div>

          <div class="filter-item filter-item-action">
            <div class="filter-label">操作</div>
            <div class="filter-actions">
              <a-button type="primary" :loading="refreshing.all" @click="handleRefreshSnapshot('all')">
                刷新当前统计
              </a-button>
              <a-button @click="loadDetail">重新查询</a-button>
            </div>
          </div>
        </div>

        <div class="toolbar-tip-row">
          <span class="toolbar-tip">当前选择：{{ selectedStatDateTime || '-' }}</span>
          <span v-if="detail.compare.updatedAt" class="toolbar-tip">
            快照更新时间：{{ formatDateTime(detail.compare.updatedAt) }}
          </span>
        </div>
      </a-card>
    </div>

    <!-- 数据内容区域 - 独立容器 -->
    <div class="content-section">
      <a-spin :loading="loading" style="width: 100%">
        <a-row :gutter="16" class="overview-row">
          <a-col :xs="24" :md="8">
            <a-card :bordered="false" class="overview-card">
              <template #title>当天概览</template>
              <template #extra>
                <span class="overview-tip">统计时间点：{{ selectedStatDateTime }}</span>
              </template>
              <div class="overview-item">请求数：{{ formatCount(detail.overview.day.requestCount) }}</div>
              <div class="overview-item">成功数：{{ formatCount(detail.overview.day.successCount) }}</div>
              <div class="overview-item">失败数：{{ formatCount(detail.overview.day.failCount) }}</div>
              <div class="overview-item">消费：¥{{ formatCost(detail.overview.day.totalCost) }}</div>
            </a-card>
          </a-col>

          <a-col :xs="24" :md="8">
            <a-card :bordered="false" class="overview-card">
              <template #title>本周概览</template>
              <div class="overview-item">范围：{{ detail.ranges.weekStartDate || '-' }} ~ {{ detail.ranges.weekEndDate || '-' }}</div>
              <div class="overview-item">请求数：{{ formatCount(detail.overview.week.requestCount) }}</div>
              <div class="overview-item">成功数：{{ formatCount(detail.overview.week.successCount) }}</div>
              <div class="overview-item">失败数：{{ formatCount(detail.overview.week.failCount) }}</div>
              <div class="overview-item">消费：¥{{ formatCost(detail.overview.week.totalCost) }}</div>
            </a-card>
          </a-col>

          <a-col :xs="24" :md="8">
            <a-card :bordered="false" class="overview-card">
              <template #title>本月概览</template>
              <div class="overview-item">月份：{{ detail.ranges.monthKey || '-' }}</div>
              <div class="overview-item">请求数：{{ formatCount(detail.overview.month.requestCount) }}</div>
              <div class="overview-item">成功数：{{ formatCount(detail.overview.month.successCount) }}</div>
              <div class="overview-item">失败数：{{ formatCount(detail.overview.month.failCount) }}</div>
              <div class="overview-item">消费：¥{{ formatCost(detail.overview.month.totalCost) }}</div>
            </a-card>
          </a-col>
        </a-row>

        <a-card :bordered="false" class="section-card">
          <template #title>快照与原始日志对比</template>
          <a-table :data="detail.compare.items" :pagination="false" size="small">
            <template #columns>
              <a-table-column title="周期" data-index="label" />
              <a-table-column title="是否一致" align="center" :width="100">
                <template #cell="{ record }">
                  <a-tag :color="record.matched ? 'green' : 'red'">{{ record.matched ? '一致' : '不一致' }}</a-tag>
                </template>
              </a-table-column>
              <a-table-column title="快照请求" :width="100" align="right">
                <template #cell="{ record }">{{ formatCount(record.stored.requestCount) }}</template>
              </a-table-column>
              <a-table-column title="原始请求" :width="100" align="right">
                <template #cell="{ record }">{{ formatCount(record.raw.requestCount) }}</template>
              </a-table-column>
              <a-table-column title="请求差值" :width="100" align="right">
                <template #cell="{ record }">{{ formatCount(record.diff.requestCountDiff) }}</template>
              </a-table-column>
              <a-table-column title="快照成功" :width="100" align="right">
                <template #cell="{ record }">{{ formatCount(record.stored.successCount) }}</template>
              </a-table-column>
              <a-table-column title="原始成功" :width="100" align="right">
                <template #cell="{ record }">{{ formatCount(record.raw.successCount) }}</template>
              </a-table-column>
              <a-table-column title="成功差值" :width="100" align="right">
                <template #cell="{ record }">{{ formatCount(record.diff.successCountDiff) }}</template>
              </a-table-column>
              <a-table-column title="快照失败" :width="100" align="right">
                <template #cell="{ record }">{{ formatCount(record.stored.failCount) }}</template>
              </a-table-column>
              <a-table-column title="原始失败" :width="100" align="right">
                <template #cell="{ record }">{{ formatCount(record.raw.failCount) }}</template>
              </a-table-column>
              <a-table-column title="失败差值" :width="100" align="right">
                <template #cell="{ record }">{{ formatCount(record.diff.failCountDiff) }}</template>
              </a-table-column>
              <a-table-column title="快照消费" :width="120" align="right">
                <template #cell="{ record }">¥{{ formatCost(record.stored.totalCost) }}</template>
              </a-table-column>
              <a-table-column title="原始消费" :width="120" align="right">
                <template #cell="{ record }">¥{{ formatCost(record.raw.totalCost) }}</template>
              </a-table-column>
              <a-table-column title="消费差值" :width="120" align="right">
                <template #cell="{ record }">¥{{ formatCost(record.diff.totalCostDiff) }}</template>
              </a-table-column>
            </template>
          </a-table>
        </a-card>

        <a-row :gutter="16" class="section-row">
          <a-col :xs="24" :lg="12">
            <a-card :bordered="false" class="section-card">
              <template #title>成功排行</template>
              <template #extra>
                <a-button size="mini" :loading="refreshing.success" @click="handleRefreshSnapshot('success')">刷新统计</a-button>
              </template>
              <a-table :data="detail.successRanking" :pagination="false" size="small">
                <template #columns>
                  <a-table-column title="账号" data-index="accountName" />
                  <a-table-column title="站点" data-index="siteName" />
                  <a-table-column title="请求" data-index="totalRequests" align="right" />
                  <a-table-column title="成功" data-index="successCount" align="right" />
                  <a-table-column title="成功率" align="right">
                    <template #cell="{ record }">{{ record.successRate }}%</template>
                  </a-table-column>
                  <a-table-column title="消费" align="right">
                    <template #cell="{ record }">¥{{ formatCost(record.totalCost) }}</template>
                  </a-table-column>
                </template>
              </a-table>
            </a-card>
          </a-col>

          <a-col :xs="24" :lg="12">
            <a-card :bordered="false" class="section-card">
              <template #title>失败排行</template>
              <template #extra>
                <a-button size="mini" :loading="refreshing.fail" @click="handleRefreshSnapshot('fail')">刷新统计</a-button>
              </template>
              <a-table :data="detail.failRanking" :pagination="false" size="small">
                <template #columns>
                  <a-table-column title="账号" data-index="accountName" />
                  <a-table-column title="请求" data-index="totalRequests" align="right" />
                  <a-table-column title="失败" data-index="failCount" align="right" />
                  <a-table-column title="当前连续失败" data-index="currentFailCount" align="right" />
                </template>
              </a-table>
            </a-card>
          </a-col>
        </a-row>

        <a-row :gutter="16" class="section-row">
          <a-col :xs="24" :lg="12">
            <a-card :bordered="false" class="section-card">
              <template #title>站点分布</template>
              <template #extra>
                <a-button size="mini" :loading="refreshing.site" @click="handleRefreshSnapshot('site')">刷新统计</a-button>
              </template>
              <a-table :data="detail.siteDistribution" :pagination="false" size="small">
                <template #columns>
                  <a-table-column title="站点" data-index="siteName" />
                  <a-table-column title="请求" data-index="totalRequests" align="right" />
                  <a-table-column title="成功" data-index="successCount" align="right" />
                  <a-table-column title="成功率" align="right">
                    <template #cell="{ record }">{{ record.successRate }}%</template>
                  </a-table-column>
                  <a-table-column title="消费" align="right">
                    <template #cell="{ record }">¥{{ formatCost(record.totalCost) }}</template>
                  </a-table-column>
                </template>
              </a-table>
            </a-card>
          </a-col>

          <a-col :xs="24" :lg="12">
            <a-card :bordered="false" class="section-card">
              <template #title>小时分布</template>
              <template #extra>
                <a-button size="mini" :loading="refreshing.hourly" @click="handleRefreshSnapshot('hourly')">刷新统计</a-button>
              </template>
              <a-table :data="detail.hourlyDistribution" :pagination="false" size="small">
                <template #columns>
                  <a-table-column title="小时" data-index="label" />
                  <a-table-column title="请求" data-index="requests" align="right" />
                  <a-table-column title="成功" data-index="successCount" align="right" />
                  <a-table-column title="失败" data-index="failCount" align="right" />
                  <a-table-column title="消费" align="right">
                    <template #cell="{ record }">¥{{ formatCost(record.totalCost) }}</template>
                  </a-table-column>
                </template>
              </a-table>
            </a-card>
          </a-col>
        </a-row>

        <a-row :gutter="16" class="section-row">
          <a-col :xs="24" :lg="12">
            <a-card :bordered="false" class="section-card">
              <template #title>备注请求排行</template>
              <template #extra>
                <a-button size="mini" :loading="refreshing.remarkRequest" @click="handleRefreshSnapshot('remarkRequest')">刷新统计</a-button>
              </template>
              <a-table :data="detail.remarkRequestRanking" :pagination="false" size="small">
                <template #columns>
                  <a-table-column title="备注" data-index="remark" />
                  <a-table-column title="请求" data-index="totalRequests" align="right" />
                  <a-table-column title="成功" data-index="successCount" align="right" />
                  <a-table-column title="失败" data-index="failCount" align="right" />
                </template>
              </a-table>
            </a-card>
          </a-col>

          <a-col :xs="24" :lg="12">
            <a-card :bordered="false" class="section-card">
              <template #title>备注消费排行</template>
              <template #extra>
                <a-button size="mini" :loading="refreshing.remarkCost" @click="handleRefreshSnapshot('remarkCost')">刷新统计</a-button>
              </template>
              <a-table :data="detail.remarkCostRanking" :pagination="false" size="small">
                <template #columns>
                  <a-table-column title="备注" data-index="remark" />
                  <a-table-column title="请求" data-index="totalRequests" align="right" />
                  <a-table-column title="消费" align="right">
                    <template #cell="{ record }">¥{{ formatCost(record.totalCost) }}</template>
                  </a-table-column>
                </template>
              </a-table>
            </a-card>
          </a-col>
        </a-row>
      </a-spin>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import {
  getStatsSnapshotDetail,
  getStatsSnapshotOptions,
  refreshStatsSnapshot,
} from '@/api/statsSnapshot'

const loading = ref(false)

const options = reactive({
  availableDates: [],
  availableMonths: [],
  currentDateTime: '',
  latestDateTime: '',
})

const filters = reactive({
  statDate: '',
  statTime: '23:59:59',
  compareMonth: '',
})

const refreshing = reactive({
  all: false,
  success: false,
  fail: false,
  site: false,
  hourly: false,
  remarkRequest: false,
  remarkCost: false,
})

const detail = reactive({
  ranges: {
    weekStartDate: '',
    weekEndDate: '',
    monthKey: '',
  },
  overview: {
    day: { requestCount: 0, successCount: 0, failCount: 0, totalCost: 0 },
    week: { requestCount: 0, successCount: 0, failCount: 0, totalCost: 0 },
    month: { requestCount: 0, successCount: 0, failCount: 0, totalCost: 0 },
  },
  successRanking: [],
  failRanking: [],
  siteDistribution: [],
  hourlyDistribution: [],
  remarkRequestRanking: [],
  remarkCostRanking: [],
  compare: {
    updatedAt: '',
    items: [],
  },
})

const availableDateSet = computed(() => new Set(options.availableDates))
const selectedStatDateTime = computed(() => `${filters.statDate || '-'} ${filters.statTime || '23:59:59'}`)

const formatCount = (value) => Number(value || 0).toLocaleString('zh-CN')
const formatCost = (value) => Number(value || 0).toFixed(4)

// 使用中国时区格式化日期
const formatDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }

  // 使用 toLocaleString 获取中国时区的日期
  const chinaTime = date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // zh-CN 格式是 YYYY/MM/DD，转换为 YYYY-MM-DD
  return chinaTime.replace(/\//g, '-')
}

const getDatePart = (value) => (typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : '')
const getTimePart = (value) => (typeof value === 'string' && value.length >= 19 ? value.slice(11, 19) : '')

const getCurrentStatDate = () => getDatePart(options.currentDateTime) || formatDateOnly(new Date())

const getDefaultTimeByDate = (statDate) => {
  if (!statDate) {
    return '23:59:59'
  }

  if (getDatePart(options.latestDateTime) === statDate) {
    return getTimePart(options.latestDateTime) || '23:59:59'
  }

  if (getCurrentStatDate() === statDate) {
    return getTimePart(options.currentDateTime) || '23:59:59'
  }

  return '23:59:59'
}

const normalizePickerDate = (value) => {
  if (!value) {
    return ''
  }

  // Arco Design 日期选择器可能传入字符串格式
  if (typeof value === 'string') {
    return value.slice(0, 10)
  }

  // Date 对象需要使用中国时区转换
  if (value instanceof Date) {
    return formatDateOnly(value)
  }

  // Dayjs 对象
  if (typeof value.format === 'function') {
    return value.format('YYYY-MM-DD')
  }

  if (typeof value.toDate === 'function') {
    return formatDateOnly(value.toDate())
  }

  if (value.$d instanceof Date) {
    return formatDateOnly(value.$d)
  }

  return ''
}

const formatDateTime = (value) => {
  if (!value) {
    return '-'
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
}

const disableStatDate = (current) => {
  const dateValue = normalizePickerDate(current)
  if (!dateValue) {
    return false
  }
  // 当前日期总是可选
  const today = getCurrentStatDate()
  if (dateValue === today) {
    return false
  }
  // 检查是否在可用日期列表中
  return !availableDateSet.value.has(dateValue)
}

const applyDetailData = (data) => {
  detail.ranges = data.ranges || detail.ranges
  detail.overview = data.overview || detail.overview
  detail.successRanking = data.successRanking || []
  detail.failRanking = data.failRanking || []
  detail.siteDistribution = data.siteDistribution || []
  detail.hourlyDistribution = data.hourlyDistribution || []
  detail.remarkRequestRanking = data.remarkRequestRanking || []
  detail.remarkCostRanking = data.remarkCostRanking || []
  detail.compare = data.compare || detail.compare

  if (data.statDate) {
    filters.statDate = data.statDate
  }

  if (data.compareMonth) {
    filters.compareMonth = data.compareMonth
  }
}

const loadOptions = async () => {
  const res = await getStatsSnapshotOptions()
  options.availableDates = res.data.availableDates || []
  options.availableMonths = res.data.availableMonths || []
  options.currentDateTime = res.data.currentDateTime || ''
  options.latestDateTime = res.data.latestDateTime || ''

  const currentStatDate = getCurrentStatDate()

  if (options.availableDates.length) {
    if (!filters.statDate || (!availableDateSet.value.has(filters.statDate) && filters.statDate !== currentStatDate)) {
      filters.statDate = currentStatDate
    }
  }

  filters.statTime = getDefaultTimeByDate(filters.statDate)

  if (!filters.compareMonth || !options.availableMonths.includes(filters.compareMonth)) {
    filters.compareMonth = filters.statDate ? filters.statDate.slice(0, 7) : (options.availableMonths[0] || '')
  }
}

const loadDetail = async () => {
  if (!filters.statDate) {
    return
  }

  loading.value = true
  try {
    const res = await getStatsSnapshotDetail({
      statDate: filters.statDate,
      compareMonth: filters.compareMonth,
    })
    applyDetailData(res.data)
  } finally {
    loading.value = false
  }
}

const handleStatDateChange = async () => {
  if (!filters.statDate) {
    return
  }

  filters.statTime = getDefaultTimeByDate(filters.statDate)
  filters.compareMonth = filters.statDate.slice(0, 7)
  await loadDetail()
}

const handleStatTimeChange = async () => {
  await loadDetail()
}

const handleCompareMonthChange = async () => {
  await loadDetail()
}

const handleRefreshSnapshot = async (refreshKey) => {
  if (!filters.statDate) {
    Message.warning('请先选择有日志的日期')
    return
  }

  refreshing[refreshKey] = true
  if (refreshKey !== 'all') {
    refreshing.all = true
  }

  try {
    const res = await refreshStatsSnapshot({
      statDate: filters.statDate,
    })
    Message.success(res.message || '刷新统计成功')
    await loadDetail()
  } finally {
    refreshing[refreshKey] = false
    refreshing.all = false
  }
}

onMounted(async () => {
  await loadOptions()
  await loadDetail()
})
</script>

<style scoped>
.stats-snapshot-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
}

/* 筛选器区域 - 独立容器，不被内容区域遮挡 */
.filter-section {
  flex-shrink: 0;
}

.filter-section :deep(.arco-card) {
  border-radius: 8px;
}

/* 数据内容区域 - 独立容器 */
.content-section {
  flex: 1;
  min-height: 0;
}

.section-card,
.overview-card {
  border-radius: 8px;
}

.overview-row,
.section-row {
  margin-top: 0;
}

.toolbar-header {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.toolbar-summary-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: var(--color-fill-2);
  border-radius: 8px;
}

.toolbar-summary-label {
  font-size: 13px;
  color: #86909c;
}

.toolbar-summary-value {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-item-action {
  justify-content: flex-end;
}

.filter-label {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
}

.filter-control {
  width: 100%;
}

.filter-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 32px;
}

.toolbar-tip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 14px;
}

.toolbar-tip,
.overview-tip {
  color: #86909c;
  font-size: 13px;
}

.overview-item {
  line-height: 30px;
  color: #1d2129;
}

@media (max-width: 1200px) {
  .filters-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 992px) {
  .toolbar-header {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .toolbar-header {
    grid-template-columns: 1fr;
  }

  .filters-grid {
    grid-template-columns: 1fr;
  }

  .filter-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
