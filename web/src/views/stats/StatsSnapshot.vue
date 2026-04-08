<template>
  <div class="stats-page">
    <!-- 工具栏 -->
    <div class="toolbar-section">
      <a-space>
        <a-button type="outline" :loading="settlementLoading" @click="handleDailySettlement">
          <template #icon><icon-refresh /></template>
          结算昨日数据
        </a-button>
        <a-button type="outline" @click="showBatchSettlementModal = true">
          <template #icon><icon-calendar /></template>
          批量结算历史
        </a-button>
        <a-button type="outline" :loading="clearCacheLoading" @click="handleClearCache">
          <template #icon><icon-delete /></template>
          清除今日缓存
        </a-button>
        <a-popconfirm
          content="确定要清空所有新统计数据吗？这将删除 daily_stats 和 monthly_stats 表中的所有数据，并清除所有缓存。此操作不可恢复！"
          type="warning"
          @ok="handleClearAllNewStats"
        >
          <a-button type="outline" status="danger" :loading="clearAllLoading">
            <template #icon><icon-delete /></template>
            一键清空数据
          </a-button>
        </a-popconfirm>
      </a-space>
    </div>

    <!-- 概览卡片 -->
    <a-row :gutter="16" class="overview-cards">
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-tooltip :content="`${overview.today.requests.toLocaleString()} 次`">
            <a-statistic title="今日请求" :value="getStatValue(overview.today.requests)" :precision="getStatPrecision(overview.today.requests)">
              <template #suffix>
                <span class="stat-suffix">{{ getStatSuffix(overview.today.requests) }}</span>
                <span
                  v-if="overview.yesterday.requests > 0"
                  class="stat-compare-inline"
                  :class="
                    overview.today.requests >= overview.yesterday.requests
                      ? 'up'
                      : 'down'
                  "
                >
                  {{
                    overview.today.requests >= overview.yesterday.requests
                      ? "↑"
                      : "↓"
                  }}{{
                    Math.abs(
                      overview.today.requests - overview.yesterday.requests
                    )
                  }}
                </span>
              </template>
            </a-statistic>
          </a-tooltip>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-tooltip :content="`${overview.today.successCount.toLocaleString()} 次`">
            <a-statistic title="今日成功" :value="getStatValue(overview.today.successCount)" :precision="getStatPrecision(overview.today.successCount)">
              <template #suffix>
                <span class="stat-suffix">{{ getStatSuffix(overview.today.successCount) }}</span>
                <span class="stat-rate-inline">
                  {{
                    overview.today.requests > 0
                      ? (
                          (overview.today.successCount /
                            overview.today.requests) *
                          100
                        ).toFixed(1)
                      : 0
                  }}%
                </span>
              </template>
            </a-statistic>
          </a-tooltip>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-statistic
            title="今日消费"
            :value="overview.today.cost"
            :precision="4"
            :show-group-separator="true"
          >
            <template #prefix>¥</template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-tooltip :content="`${overview.week.requests.toLocaleString()} 次`">
            <a-statistic title="自然周请求" :value="getStatValue(overview.week.requests)" :precision="getStatPrecision(overview.week.requests)">
              <template #suffix>
                <span class="stat-suffix">{{ getStatSuffix(overview.week.requests) }}</span>
              </template>
            </a-statistic>
          </a-tooltip>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-tooltip
            :content="`${overview.month.requests.toLocaleString()} 次`"
          >
            <a-statistic title="自然月请求" :value="getStatValue(overview.month.requests)" :precision="getStatPrecision(overview.month.requests)">
              <template #suffix>
                <span class="stat-suffix">{{ getStatSuffix(overview.month.requests) }}</span>
              </template>
            </a-statistic>
          </a-tooltip>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="8" :md="6" :lg="4">
        <a-card hoverable class="stat-card">
          <a-tooltip
            :content="`${overview.total.requests.toLocaleString()} 次`"
          >
            <a-statistic title="累计请求" :value="getStatValue(overview.total.requests)" :precision="getStatPrecision(overview.total.requests)">
              <template #suffix>
                <span class="stat-suffix">{{ getStatSuffix(overview.total.requests) }}</span>
              </template>
            </a-statistic>
          </a-tooltip>
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
            <a-radio-group
              v-model="chartType"
              size="small"
              type="button"
              @change="loadHourlyData"
            >
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
              <span class="total-text">共 {{ formatCount(siteTotal) }} 次</span>
            </div>
          </template>
          <template #extra>
            <a-radio-group
              v-model="siteType"
              size="small"
              type="button"
              @change="loadSiteData"
            >
              <a-radio value="today">今日</a-radio>
              <a-radio value="week">本周</a-radio>
              <a-radio value="month">本月</a-radio>
              <a-radio value="total">总计</a-radio>
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
              <span class="total-text">共 {{ formatCount(successTotal) }} 次</span>
            </div>
          </template>
          <template #extra>
            <a-radio-group
              v-model="rankingType"
              size="small"
              type="button"
              @change="handleRankingTypeChange"
            >
              <a-radio value="today">今日</a-radio>
              <a-radio value="week">本周</a-radio>
              <a-radio value="month">本月</a-radio>
              <a-radio value="total">总计</a-radio>
            </a-radio-group>
          </template>
          <a-table
            :data="successRanking"
            :pagination="false"
            :bordered="false"
            size="small"
          >
            <template #columns>
              <a-table-column title="排名" :width="50" align="center">
                <template #cell="{ rowIndex }">
                  <a-tag
                    :color="
                      rowIndex < 3
                        ? ['gold', 'silver', '#cd7f32'][rowIndex]
                        : 'gray'
                    "
                    size="small"
                  >
                    {{ rowIndex + 1 }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column title="账号" :width="100">
                <template #cell="{ record }">
                  <a-tooltip :content="record.accountName">
                    <span class="ellipsis-text">{{ record.accountName }}</span>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="网站" :width="70">
                <template #cell="{ record }">
                  <a-tooltip :content="record.siteName">
                    <span class="ellipsis-text">{{ record.siteName }}</span>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="成功数" :width="90" align="right">
                <template #cell="{ record }">
                  <a-tooltip :content="`成功次数: ${record.successCount}`">
                    <span class="success-num">{{
                      formatCount(record.successCount)
                    }}</span>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="成功率" :width="85" align="right">
                <template #cell="{ record }">
                  <span
                    :class="
                      parseFloat(record.successRate) >= 90
                        ? 'rate-good'
                        : parseFloat(record.successRate) >= 70
                        ? 'rate-normal'
                        : 'rate-bad'
                    "
                  >
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
              <span class="total-text">共 {{ formatCount(failTotal) }} 次</span>
            </div>
          </template>
          <template #extra>
            <a-radio-group
              v-model="rankingType"
              size="small"
              type="button"
              @change="handleRankingTypeChange"
            >
              <a-radio value="today">今日</a-radio>
              <a-radio value="week">本周</a-radio>
              <a-radio value="month">本月</a-radio>
              <a-radio value="total">总计</a-radio>
            </a-radio-group>
          </template>
          <a-table
            :data="failRanking"
            :pagination="false"
            :bordered="false"
            size="small"
          >
            <template #columns>
              <a-table-column title="排名" :width="65" align="center">
                <template #cell="{ rowIndex }">
                  <span class="fail-rank">{{ rowIndex + 1 }}</span>
                </template>
              </a-table-column>
              <a-table-column title="账号" :width="100">
                <template #cell="{ record }">
                  <a-tooltip :content="record.accountName">
                    <span class="ellipsis-text">{{ record.accountName }}</span>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="请求数" :width="80" align="right">
                <template #cell="{ record }">
                  <a-tooltip :content="`请求数: ${record.totalRequests}`">
                    <span>{{ formatCount(record.totalRequests) }}</span>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="失败数" :width="80" align="right">
                <template #cell="{ record }">
                  <a-tooltip :content="`失败数: ${record.failCount}`">
                    <span class="fail-num">{{
                      formatCount(record.failCount)
                    }}</span>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="连续" :width="60" align="right">
                <template #cell="{ record }">
                  <a-tag
                    v-if="record.currentFailCount >= 3"
                    color="red"
                    size="small"
                  >
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

    <!-- 备注排行 -->
    <a-row :gutter="16" class="remark-row">
      <a-col :xs="24" :lg="12">
        <a-card hoverable class="ranking-card">
          <template #title>
            <div class="card-header">
              <span>备注请求排行</span>
              <span class="total-text">共 {{ formatCount(remarkRequestTotal) }} 次</span>
            </div>
          </template>
          <template #extra>
            <a-radio-group
              v-model="remarkType"
              size="small"
              type="button"
              @change="handleRemarkTypeChange"
            >
              <a-radio value="today">今日</a-radio>
              <a-radio value="week">本周</a-radio>
              <a-radio value="month">本月</a-radio>
              <a-radio value="total">总计</a-radio>
            </a-radio-group>
          </template>
          <a-table
            :data="remarkRequestRanking"
            :pagination="false"
            :bordered="false"
            size="small"
          >
            <template #columns>
              <a-table-column title="排名" :width="65" align="center">
                <template #cell="{ rowIndex }">
                  <a-tag
                    :color="
                      rowIndex < 3
                        ? ['gold', 'silver', '#cd7f32'][rowIndex]
                        : 'gray'
                    "
                    size="small"
                  >
                    {{ rowIndex + 1 }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column title="备注" :width="65">
                <template #cell="{ record }">
                  <a-tooltip :content="record.remark || '-'">
                    <span class="ellipsis-text">{{
                      record.remark || "-"
                    }}</span>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="总请求" :width="100" align="right">
                <template #cell="{ record }">
                  <span>{{ formatCount(record.totalRequests) }}</span>
                </template>
              </a-table-column>
              <a-table-column title="成功" :width="80" align="right">
                <template #cell="{ record }">
                  <span class="success-num">{{
                    formatCount(record.successCount)
                  }}</span>
                </template>
              </a-table-column>
              <a-table-column title="失败" :width="80" align="right">
                <template #cell="{ record }">
                  <span class="fail-num">{{
                    formatCount(record.failCount)
                  }}</span>
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
              <span>备注消费排行</span>
              <span class="total-text">¥{{ formatCost(remarkCostTotal) }}</span>
            </div>
          </template>
          <template #extra>
            <a-radio-group
              v-model="remarkType"
              size="small"
              type="button"
              @change="handleRemarkTypeChange"
            >
              <a-radio value="today">今日</a-radio>
              <a-radio value="week">本周</a-radio>
              <a-radio value="month">本月</a-radio>
              <a-radio value="total">总计</a-radio>
            </a-radio-group>
          </template>
          <a-table
            :data="remarkCostRanking"
            :pagination="false"
            :bordered="false"
            size="small"
          >
            <template #columns>
              <a-table-column title="排名" :width="50" align="center">
                <template #cell="{ rowIndex }">
                  <a-tag
                    :color="
                      rowIndex < 3
                        ? ['gold', 'silver', '#cd7f32'][rowIndex]
                        : 'gray'
                    "
                    size="small"
                  >
                    {{ rowIndex + 1 }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column title="备注" :width="50">
                <template #cell="{ record }">
                  <a-tooltip :content="record.remark || '-'">
                    <span class="ellipsis-text">{{
                      record.remark || "-"
                    }}</span>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="消费金额" :width="100" align="right">
                <template #cell="{ record }">
                  <span class="cost-num"
                    >¥{{ record.totalCost.toFixed(4) }}</span
                  >
                </template>
              </a-table-column>
              <a-table-column title="请求数" :width="100" align="right">
                <template #cell="{ record }">
                  <span>{{ formatCount(record.totalRequests) }}</span>
                </template>
              </a-table-column>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>

    <!-- 批量结算模态框 -->
    <a-modal
      v-model:visible="showBatchSettlementModal"
      title="批量结算历史数据"
      :confirm-loading="batchSettlementLoading"
      @ok="handleBatchSettlement"
      @cancel="showBatchSettlementModal = false"
    >
      <a-form :model="batchSettlementForm" layout="vertical">
        <a-form-item label="开始日期" required>
          <a-date-picker
            v-model="batchSettlementForm.startDate"
            value-format="YYYY-MM-DD"
            format="YYYY-MM-DD"
            placeholder="请选择开始日期"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="结束日期" required>
          <a-date-picker
            v-model="batchSettlementForm.endDate"
            value-format="YYYY-MM-DD"
            format="YYYY-MM-DD"
            placeholder="请选择结束日期"
            style="width: 100%"
          />
        </a-form-item>
        <a-alert type="info" style="margin-top: 8px">
          将指定日期范围内每天的日志数据聚合到 daily_stats 表中
        </a-alert>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from "vue";
import { Message } from "@arco-design/web-vue";
import {
  getStatsOverviewNew,
  getAccountSuccessRankingNew,
  getAccountFailRankingNew,
  getSiteDistributionNew,
  getHourlyDistributionNew,
  getRemarkRequestRankingNew,
  getRemarkCostRankingNew,
  triggerDailySettlement,
  triggerBatchSettlement,
  clearTodayCache,
  clearAllNewStats,
} from "@/api/statsSnapshot";
import { IconRefresh, IconCalendar, IconDelete } from "@arco-design/web-vue/es/icon";
import * as echarts from "echarts";

// 结算相关
const settlementLoading = ref(false);
const clearCacheLoading = ref(false);
const clearAllLoading = ref(false);
const showBatchSettlementModal = ref(false);
const batchSettlementLoading = ref(false);
const batchSettlementForm = reactive({
  startDate: "",
  endDate: "",
});

// 概览数据
const overview = reactive({
  today: { requests: 0, successCount: 0, cost: 0 },
  yesterday: { requests: 0, successCount: 0, cost: 0 },
  week: { requests: 0, successCount: 0, cost: 0 },
  month: { requests: 0, successCount: 0, cost: 0 },
  total: { requests: 0, successCount: 0, cost: 0 },
  accounts: { total: 0, active: 0, abnormal: 0, lowBalance: 0 },
});

// 图表类型
const chartType = ref("today");
const siteType = ref("today");
const rankingType = ref("today");

// 排行数据
const successRanking = ref([]);
const failRanking = ref([]);
const siteDistribution = ref([]);

// 总计数据（从后端获取）
const successTotalData = ref({ successCount: 0, totalRequests: 0 });
const failTotalData = ref({ failCount: 0, totalRequests: 0 });
const siteTotalData = ref({ totalRequests: 0, successCount: 0 });

// 计算总数（使用后端返回的数据）
const successTotal = computed(() => successTotalData.value.successCount);
const failTotal = computed(() => failTotalData.value.failCount);
const siteTotal = computed(() => siteTotalData.value.totalRequests);

// 备注排行数据
const remarkType = ref("today");
const remarkRequestRanking = ref([]);
const remarkCostRanking = ref([]);
const remarkRequestTotal = ref(0);
const remarkCostTotal = ref(0);

// 图表引用
const hourlyChartRef = ref(null);
const siteChartRef = ref(null);
let hourlyChart = null;
let siteChart = null;

// 数字格式化函数
const formatCount = (count) => {
  if (count === 0) return "0";
  if (count < 1000) return count.toString();
  if (count < 10000) return (count / 1000).toFixed(2) + "k";
  if (count < 100000) return (count / 10000).toFixed(2) + "w";
  if (count < 100000000) return Math.floor(count / 10000) + "w";
  return "1亿+";
};

// 获取统计数字的数值部分（用于 a-statistic 的 value）
const getStatValue = (count) => {
  if (count === 0) return 0;
  if (count < 1000) return count;
  if (count < 10000) return parseFloat((count / 1000).toFixed(2));
  if (count < 100000) return parseFloat((count / 10000).toFixed(2));
  if (count < 100000000) return Math.floor(count / 10000);
  return 1;
};

// 获取统计数字的后缀部分
const getStatSuffix = (count) => {
  if (count === 0) return "次";
  if (count < 1000) return "次";
  if (count < 10000) return "k次";
  if (count < 100000000) return "w次";
  return "亿次";
};

// 获取统计数字的小数位数（小于1000不显示小数）
const getStatPrecision = (count) => {
  if (count === 0) return 0;
  if (count < 1000) return 0;
  return 2;
};

// 加载概览数据
const loadOverview = async () => {
  try {
    const res = await getStatsOverviewNew();
    Object.assign(overview, res.data);
  } catch (error) {
    console.error("加载概览数据失败:", error);
  }
};

// 加载成功排行
const loadSuccessRanking = async () => {
  try {
    const res = await getAccountSuccessRankingNew({
      type: rankingType.value,
      limit: 10,
    });
    if (res.data) {
      successRanking.value = res.data.list || [];
      if (res.data.total) {
        successTotalData.value = res.data.total;
      }
    }
  } catch (error) {
    console.error("加载成功排行失败:", error);
  }
};

// 加载失败排行
const loadFailRanking = async () => {
  try {
    const res = await getAccountFailRankingNew({
      type: rankingType.value,
      limit: 10,
    });
    if (res.data) {
      failRanking.value = res.data.list || [];
      if (res.data.total) {
        failTotalData.value = res.data.total;
      }
    }
  } catch (error) {
    console.error("加载失败排行失败:", error);
  }
};

// 加载网站分布
const loadSiteData = async () => {
  try {
    const res = await getSiteDistributionNew({ type: siteType.value });
    if (res.data) {
      siteDistribution.value = res.data.list || [];
      if (res.data.total) {
        siteTotalData.value = res.data.total;
      }
      renderSiteChart(res.data.list || []);
    }
  } catch (error) {
    console.error("加载网站分布失败:", error);
  }
};

// 加载每小时分布
const loadHourlyData = async () => {
  try {
    const res = await getHourlyDistributionNew({ type: chartType.value });
    renderHourlyChart(res.data);
  } catch (error) {
    console.error("加载小时分布失败:", error);
  }
};

// 加载备注请求排行
const loadRemarkRequestRanking = async () => {
  try {
    const res = await getRemarkRequestRankingNew({
      type: remarkType.value,
      limit: 10,
    });
    if (res.data) {
      remarkRequestRanking.value = res.data.list || [];
      remarkRequestTotal.value = res.data.total?.totalRequests || 0;
    }
  } catch (error) {
    console.error("加载备注请求排行失败:", error);
  }
};

// 加载备注消费排行
const loadRemarkCostRanking = async () => {
  try {
    const res = await getRemarkCostRankingNew({
      type: remarkType.value,
      limit: 10,
    });
    if (res.data) {
      remarkCostRanking.value = res.data.list || [];
      remarkCostTotal.value = res.data.total?.totalCost || 0;
    }
  } catch (error) {
    console.error("加载备注消费排行失败:", error);
  }
};

const handleRankingTypeChange = async () => {
  await Promise.all([loadSuccessRanking(), loadFailRanking()]);
};

const handleRemarkTypeChange = async () => {
  await Promise.all([loadRemarkRequestRanking(), loadRemarkCostRanking()]);
};

// 结算昨日数据
const handleDailySettlement = async () => {
  settlementLoading.value = true;
  try {
    const res = await triggerDailySettlement();
    Message.success(res.message || "结算完成");
    // 刷新数据
    await loadOverview();
  } catch (error) {
    Message.error(error.message || "结算失败");
  } finally {
    settlementLoading.value = false;
  }
};

// 批量结算历史数据
const handleBatchSettlement = async () => {
  if (!batchSettlementForm.startDate || !batchSettlementForm.endDate) {
    Message.warning("请选择开始日期和结束日期");
    return;
  }
  batchSettlementLoading.value = true;
  try {
    const res = await triggerBatchSettlement({
      startDate: batchSettlementForm.startDate,
      endDate: batchSettlementForm.endDate,
    });
    Message.success(res.message || "批量结算完成");
    showBatchSettlementModal.value = false;
    // 刷新数据
    await loadOverview();
  } catch (error) {
    Message.error(error.message || "批量结算失败");
  } finally {
    batchSettlementLoading.value = false;
  }
};

// 清除今日缓存
const handleClearCache = async () => {
  clearCacheLoading.value = true;
  try {
    const res = await clearTodayCache();
    Message.success(res.message || "缓存已清除");
    // 刷新数据
    await loadOverview();
    await loadHourlyData();
    await loadSiteData();
    await handleRankingTypeChange();
    await handleRemarkTypeChange();
  } catch (error) {
    Message.error(error.message || "清除缓存失败");
  } finally {
    clearCacheLoading.value = false;
  }
};

// 一键清空新方案数据
const handleClearAllNewStats = async () => {
  clearAllLoading.value = true;
  try {
    const res = await clearAllNewStats();
    Message.success(res.message || "数据已清空");
    // 刷新数据
    await loadOverview();
    await loadHourlyData();
    await loadSiteData();
    await handleRankingTypeChange();
    await handleRemarkTypeChange();
  } catch (error) {
    Message.error(error.message || "清空数据失败");
  } finally {
    clearAllLoading.value = false;
  }
};

// 金额格式化函数
const formatCost = (cost) => {
  if (cost === 0) return "0";
  if (cost < 0.01) return cost.toFixed(6);
  if (cost < 1) return cost.toFixed(4);
  if (cost < 1000) return cost.toFixed(2);
  if (cost < 10000) return (cost / 1000).toFixed(2) + "k";
  return (cost / 10000).toFixed(2) + "w";
};

// 渲染小时分布图表
const renderHourlyChart = (data) => {
  if (!hourlyChartRef.value) return;

  if (!hourlyChart) {
    hourlyChart = echarts.init(hourlyChartRef.value);
  }

  const option = {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
    },
    legend: {
      data: ["请求数", "成功数"],
      bottom: 0,
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      top: "10%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: data.map((d) => d.label),
      axisLabel: {
        interval: chartType.value === "today" ? 2 : 3,
      },
    },
    yAxis: {
      type: "value",
    },
    series: [
      {
        name: "请求数",
        type: "bar",
        data: data.map((d) => d.requests),
        itemStyle: { color: "#165DFF" },
      },
      {
        name: "成功数",
        type: "bar",
        data: data.map((d) => d.successCount),
        itemStyle: { color: "#00B42A" },
      },
    ],
  };

  hourlyChart.setOption(option);
};

// 渲染网站分布图表
const renderSiteChart = (data) => {
  if (!siteChartRef.value) return;

  if (!siteChart) {
    siteChart = echarts.init(siteChartRef.value);
  }

  const chartData = data.slice(0, 8).map((d) => ({
    name: d.siteName,
    value: d.totalRequests,
  }));

  const option = {
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
    },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 10,
      top: 20,
      bottom: 20,
    },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        center: ["35%", "50%"],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: "#fff",
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: "bold",
          },
        },
        data: chartData,
      },
    ],
  };

  siteChart.setOption(option);
};

// 窗口大小变化
const handleResize = () => {
  hourlyChart?.resize();
  siteChart?.resize();
};

onMounted(async () => {
  await Promise.all([
    loadOverview(),
    loadSuccessRanking(),
    loadFailRanking(),
    loadRemarkRequestRanking(),
    loadRemarkCostRanking(),
  ]);

  await nextTick();
  loadHourlyData();
  loadSiteData();

  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  hourlyChart?.dispose();
  siteChart?.dispose();
});
</script>

<style scoped>
.stats-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
}

.toolbar-section {
  flex-shrink: 0;
  padding: 12px 0;
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
  color: #00b42a;
}

.stat-compare-inline.down {
  color: #f53f3f;
}

.stat-rate-inline {
  margin-left: 8px;
  font-size: 12px;
  font-weight: normal;
  color: var(--color-text-3);
}

.chart-row,
.ranking-row,
.remark-row {
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
  min-width: 0;
}

.total-text {
  font-size: 12px;
  color: var(--color-text-3);
  font-weight: normal;
  flex-shrink: 0;
  white-space: nowrap;
}

.ranking-card :deep(.arco-card-body) {
  padding: 12px;
}

.ellipsis-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.success-num {
  color: #00b42a;
  font-weight: 500;
}

.fail-num {
  color: #f53f3f;
  font-weight: 500;
}

.fail-rank {
  color: #f53f3f;
}

.rate-good {
  color: #00b42a;
}

.rate-normal {
  color: #ff7d00;
}

.rate-bad {
  color: #f53f3f;
}

.cost-num {
  color: #165dff;
  font-weight: 500;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .overview-cards :deep(.arco-col) {
    margin-bottom: 8px;
  }

  .chart-row :deep(.arco-col),
  .ranking-row :deep(.arco-col),
  .monitor-row :deep(.arco-col),
  .remark-row :deep(.arco-col) {
    margin-bottom: 16px;
  }

  /* 排行榜卡片移动端：时间选择器另起一行 */
  .ranking-card :deep(.arco-card-header) {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    height: auto;
    padding-bottom: 0;
  }

  .ranking-card :deep(.arco-card-header-title) {
    width: 100%;
    min-width: 0;
    margin-bottom: 0;
  }

  .ranking-card :deep(.arco-card-header-extra) {
    width: 100%;
    margin-left: 0 !important;
  }

  .ranking-card .card-header {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    row-gap: 4px;
  }

  .ranking-card :deep(.arco-card-header-extra .arco-radio-group) {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
  }

  .site-chart-card :deep(.arco-card-header) {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    height: auto;
    padding-bottom: 0;
  }

  .site-chart-card :deep(.arco-card-header-title) {
    width: 100%;
    min-width: 0;
    margin-bottom: 0;
  }

  .site-chart-card :deep(.arco-card-header-extra) {
    width: 100%;
    margin-left: 0 !important;
  }

  .site-chart-card .card-header {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    row-gap: 4px;
  }

  .site-chart-card :deep(.arco-card-header-extra .arco-radio-group) {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
  }

  /* 图表卡片移动端：允许滚动 */
  .chart-card {
    min-height: auto;
    height: auto;
  }

  .chart-card :deep(.arco-card-body) {
    height: auto;
    min-height: 300px;
    overflow-x: auto;
  }

  .chart-container {
    min-height: 300px;
    width: 100%;
  }
}
</style>
