<template>
  <div class="log-list">
    <a-card :bordered="false">
      <!-- 工具栏 -->
      <div class="toolbar">
        <a-select
          v-model="filters.success"
          placeholder="状态"
          allow-clear
          class="filter-select-auto"
          @change="loadData"
        >
          <a-option label="全部" value="" />
          <a-option label="成功" :value="1" />
          <a-option label="失败" :value="0" />
        </a-select>
        <a-select
          v-model="filters.siteId"
          placeholder="选择网站"
          allow-clear
          class="filter-select-auto"
          @change="loadData"
        >
          <a-option
            v-for="site in siteOptions"
            :key="site.id"
            :label="site.name"
            :value="site.id"
          />
        </a-select>
        <a-input
          v-model="filters.remark"
          placeholder="搜索备注"
          allow-clear
          class="remark-input"
          @press-enter="loadData"
          @clear="loadData"
        />
        <a-range-picker
          v-model="filters.dateRange"
          class="date-picker"
          @change="loadData"
        />
        <a-button type="primary" @click="loadData">
          <template #icon><icon-search /></template>
          <span class="btn-text">搜索</span>
        </a-button>
        <a-button status="warning" @click="handleOpenCleanupDialog">
          清理日志
        </a-button>
      </div>

      <!-- 桌面端表格 -->
      <div v-if="!isMobile" class="table-wrapper" ref="tableWrapperRef">
        <a-table
          :data="tableData"
          :loading="loading"
          :pagination="false"
          :columns="columns"
          :scroll="{ y: tableScrollY }"
          stripe
          style="width: 100%"
        >
          <template #site="{ record }">
            {{ record.site?.name || "-" }}
          </template>
          <template #account="{ record }">
            <a-tooltip v-if="record.account?.name" :content="record.account.name">
              <span>{{ formatAccountName(record.account.name) }}</span>
            </a-tooltip>
            <span v-else>-</span>
          </template>
          <template #clientIp="{ record }">
            {{ record.clientIp }}
          </template>
          <template #duration="{ record }">
            {{ getDurationLabel(record.duration, record.siteId, record.accountId) }}
          </template>
          <template #format="{ record }">
            {{ getFormatLabel(record.format, record.siteId, record.accountId) }}
          </template>
          <template #success="{ record }">
            <a-tag :color="record.success === 1 ? 'green' : 'red'" size="small">
              {{ record.success === 1 ? "成功" : "失败" }}
            </a-tag>
          </template>
          <template #remark="{ record }">
            <a-tooltip
              v-if="record.remark"
              :content="record.remark"
            >
              <span class="ellipsis-text">{{ record.remark }}</span>
            </a-tooltip>
            <span v-else>-</span>
          </template>
          <template #createdAt="{ record }">
            {{ formatDate(record.createdAt) }}
          </template>
          <template #action="{ record }">
            <a-button type="text" size="small" @click="handleViewDetail(record)"
              >详情</a-button
            >
          </template>
        </a-table>
      </div>

      <!-- 移动端卡片列表 -->
      <div v-else class="mobile-card-list">
        <a-spin :loading="loading" style="width: 100%">
          <div v-for="item in tableData" :key="item.id" class="mobile-card">
            <div class="card-header">
              <span class="card-title">ID: {{ item.id }}</span>
              <a-tag :color="item.success === 1 ? 'green' : 'red'" size="small">
                {{ item.success === 1 ? "成功" : "失败" }}
              </a-tag>
            </div>
            <div class="card-body">
              <div class="card-row">
                <span class="card-label">网站:</span>
                <span class="card-value">{{ item.site?.name || "-" }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">账号:</span>
                <span class="card-value">{{ item.account?.name || "-" }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">客户端IP:</span>
                <span class="card-value">{{ item.clientIp }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">时长/格式:</span>
                <span class="card-value"
                  >{{ getDurationLabel(item.duration, item.siteId, item.accountId) }} / {{ getFormatLabel(item.format, item.siteId, item.accountId) }}</span
                >
              </div>
              <div class="card-row">
                <span class="card-label">备注:</span>
                <span class="card-value">{{ item.remark || "-" }}</span>
              </div>
              <div class="card-row" v-if="item.errorMessage">
                <span class="card-label">错误信息:</span>
                <span class="card-value error-text">{{
                  item.errorMessage
                }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">时间:</span>
                <span class="card-value">{{ formatDate(item.createdAt) }}</span>
              </div>
            </div>
            <div class="card-actions">
              <a-button
                type="primary"
                size="small"
                @click="handleViewDetail(item)"
                >查看详情</a-button
              >
            </div>
          </div>
          <a-empty
            v-if="!loading && tableData.length === 0"
            description="暂无数据"
          />
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
          :simple="isMobile"
          :max-count="isMobile ? 5 : 7"
          @change="loadData"
          @page-size-change="loadData"
        />
      </div>
    </a-card>

    <a-modal
      v-model:visible="cleanupDialog.visible"
      title="清理历史日志"
      :confirm-loading="cleanupDialog.loading"
      @ok="handleCleanupLogs"
      @cancel="handleCloseCleanupDialog"
    >
      <a-space direction="vertical" style="width: 100%" :size="16">
        <a-alert type="warning">
          当前统计直接来自原始日志，清理日志后历史统计会同步减少，且仅允许清理今天之前的日志。
        </a-alert>
        <a-radio-group v-model="cleanupDialog.form.cleanupMode" type="button">
          <a-radio value="retainDays">保留近 N 天日志</a-radio>
          <a-radio value="dateRange">按时间段清理</a-radio>
        </a-radio-group>
        <a-input-number
          v-if="cleanupDialog.form.cleanupMode === 'retainDays'"
          v-model="cleanupDialog.form.retainDays"
          model-event="input"
          :min="1"
          :max="3650"
          placeholder="请输入保留天数"
          style="width: 100%"
        />
        <a-range-picker
          v-else
          v-model="cleanupDialog.form.dateRange"
          value-format="YYYY-MM-DD"
          style="width: 100%"
          :disabled-date="disableCleanupDate"
        />
        <a-button type="outline" :loading="cleanupDialog.previewLoading" @click="handlePreviewCleanupLogs">
          预览将删除的数据
        </a-button>
        <div v-if="cleanupDialog.previewData" class="cleanup-preview">
          <div class="cleanup-preview-summary">
            <div>删除范围：{{ cleanupDialog.previewData.deleteStartDate || "最早日志" }} ~ {{ cleanupDialog.previewData.deleteEndDate }}</div>
            <div>预计删除：{{ cleanupDialog.previewData.summary.requestCount }} 条</div>
            <div>涉及天数：{{ cleanupDialog.previewData.summary.affectedDays }} 天</div>
            <div>成功请求：{{ cleanupDialog.previewData.summary.successCount }} 条</div>
            <div>失败请求：{{ cleanupDialog.previewData.summary.failCount }} 条</div>
            <div>成功消费：{{ Number(cleanupDialog.previewData.summary.totalCost || 0).toFixed(4) }}</div>
          </div>
          <div class="cleanup-preview-days">
            <div class="cleanup-preview-days-title">涉及日期明细</div>
            <div v-if="cleanupDialog.previewData.affectedDays.length" class="cleanup-preview-day-list">
              <div v-for="item in cleanupDialog.previewData.affectedDays" :key="item.statDate" class="cleanup-preview-day-item">
                <span>{{ item.statDate }}</span>
                <span>{{ item.requestCount }} 条</span>
                <span>成功 {{ item.successCount }}</span>
                <span>失败 {{ item.failCount }}</span>
                <span>消费 {{ Number(item.totalCost || 0).toFixed(4) }}</span>
              </div>
            </div>
            <a-empty v-else description="当前范围内没有可清理日志" />
          </div>
        </div>
        <a-alert v-else type="info">
          请先点击“预览将删除的数据”，确认覆盖日期和数量后再执行清理。
        </a-alert>
      </a-space>
    </a-modal>

    <!-- 详情对话框 -->
    <a-modal
      v-model:visible="detailDialog.visible"
      title="日志详情"
      :width="isMobile ? '95%' : '600px'"
      :footer="false"
    >
      <a-descriptions :column="isMobile ? 1 : 2" bordered size="small">
        <a-descriptions-item label="ID">{{
          detailDialog.data.id
        }}</a-descriptions-item>
        <a-descriptions-item label="状态">
          <a-tag
            :color="detailDialog.data.success === 1 ? 'green' : 'red'"
            size="small"
          >
            {{ detailDialog.data.success === 1 ? "成功" : "失败" }}
          </a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="网站">{{
          detailDialog.data.site?.name || "-"
        }}</a-descriptions-item>
        <a-descriptions-item label="账号">{{
          detailDialog.data.account?.name || "-"
        }}</a-descriptions-item>
        <a-descriptions-item label="客户端IP">{{
          detailDialog.data.clientIp
        }}</a-descriptions-item>
        <a-descriptions-item label="时长参数">{{
          getDurationDetailLabel(detailDialog.data.duration, detailDialog.data.siteId, detailDialog.data.accountId)
        }}</a-descriptions-item>
        <a-descriptions-item label="格式参数">{{
          getFormatDetailLabel(detailDialog.data.format, detailDialog.data.siteId, detailDialog.data.accountId)
        }}</a-descriptions-item>
        <a-descriptions-item label="备注">{{
          detailDialog.data.remark || "-"
        }}</a-descriptions-item>
        <a-descriptions-item label="时间">{{
          formatDate(detailDialog.data.createdAt)
        }}</a-descriptions-item>
        <a-descriptions-item label="错误信息" :span="isMobile ? 1 : 2">
          {{ detailDialog.data.errorMessage || "-" }}
        </a-descriptions-item>
        <a-descriptions-item label="响应内容" :span="isMobile ? 1 : 2">
          <div class="response-preview">
            {{ detailDialog.data.responsePreview || "-" }}
          </div>
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from "vue";
import { Message } from "@arco-design/web-vue";
import {
  getLogList,
  getLogDetail,
  getDurationConfig,
  getFormatConfig,
  cleanupLogs as cleanupLogsRequest,
  previewCleanupLogs as previewCleanupLogsRequest,
} from "@/api/log";
import { getAllActiveSites } from "@/api/site";
import { IconSearch } from "@arco-design/web-vue/es/icon";

const loading = ref(false);
const tableData = ref([]);
const siteOptions = ref([]);
const tableWrapperRef = ref(null);
const tableScrollY = ref(300);
const durationConfig = ref({ sites: {}, accounts: {} });
const formatConfig = ref({ sites: {}, accounts: {} });

// 响应式检测
const isMobile = ref(false);
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

// 计算表格滚动高度
const calcTableHeight = () => {
  if (tableWrapperRef.value) {
    const wrapperHeight = tableWrapperRef.value.clientHeight;
    // 减去表头高度(约40px)和一点点缓冲
    tableScrollY.value = wrapperHeight - 50;
  }
};

const filters = reactive({
  success: "",
  siteId: "",
  dateRange: null,
  remark: "",
});

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const detailDialog = reactive({
  visible: false,
  data: {},
});

const cleanupDialog = reactive({
  visible: false,
  loading: false,
  previewLoading: false,
  previewSignature: "",
  previewData: null,
  form: {
    cleanupMode: "retainDays",
    retainDays: 7,
    dateRange: null,
  },
});

// 表格列配置
const columns = [
  { title: "ID", dataIndex: "id", width: 80 },
  { title: "网站", dataIndex: "site", width: 120, slotName: "site" },
  { title: "账号", dataIndex: "account", width: 120, slotName: "account" },
  { title: "客户端IP", dataIndex: "clientIp", width: 140 },
  { title: "时长参数", dataIndex: "duration", width: 100, align: "center", slotName: "duration" },
  { title: "格式参数", dataIndex: "format", width: 100, align: "center", slotName: "format" },
  {
    title: "状态",
    dataIndex: "success",
    width: 80,
    align: "center",
    slotName: "success",
  },
  {
    title: "备注",
    dataIndex: "remark",
    minWidth: 150,
    slotName: "remark",
  },
  { title: "时间", dataIndex: "createdAt", width: 160, slotName: "createdAt" },
  { title: "操作", width: 100, fixed: "right", slotName: "action" },
];

const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleString("zh-CN");
};

// 账号名显示：前三后二，中间用...代替
const formatAccountName = (name) => {
  if (!name) return "-";
  if (name.length <= 5) return name;
  return name.slice(0, 3) + "..." + name.slice(-2);
};

const maskIpSegment = (segment, { isFirst = false, isLast = false } = {}) => {
  if (!segment) return segment;

  if (isFirst) {
    if (segment.length <= 1) return "*";
    if (segment.length === 2) return `${segment.charAt(0)}*`;
    return `${segment.slice(0, 2)}*`;
  }

  if (isLast) {
    if (segment.length <= 1) return "*";
    return `${"*".repeat(segment.length - 1)}${segment.slice(-1)}`;
  }

  return "*";
};

const maskIpv4 = (ip) => {
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;

  return parts
    .map((part, index) =>
      maskIpSegment(part, {
        isFirst: index === 0,
        isLast: index === parts.length - 1,
      })
    )
    .join(".");
};

const maskIpv6 = (ip) => {
  const parts = ip.split(":");
  const visibleIndexes = parts
    .map((part, index) => (part ? index : -1))
    .filter((index) => index !== -1);

  if (visibleIndexes.length === 0) return ip;

  const firstVisibleIndex = visibleIndexes[0];
  const lastVisibleIndex = visibleIndexes[visibleIndexes.length - 1];

  return parts
    .map((part, index) => {
      if (!part) return "";

      return maskIpSegment(part, {
        isFirst: index === firstVisibleIndex,
        isLast: index === lastVisibleIndex,
      });
    })
    .join(":");
};

const isLocalOrLanIpv4 = (ip) => {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = numbers;

  if (first === 0 || first === 10 || first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;

  return false;
};

const isLocalOrLanIpv6 = (ip) => {
  if (!ip || ip === "::" || ip === "::1") return true;

  const normalizedIp = ip.toLowerCase();
  const firstPart = normalizedIp.split(":").find((part) => part);
  if (!firstPart) return true;

  const firstValue = Number.parseInt(firstPart, 16);
  if (Number.isNaN(firstValue)) return false;

  if ((firstValue & 0xfe00) === 0xfc00) return true;
  if ((firstValue & 0xffc0) === 0xfe80) return true;

  return false;
};

const isLocalOrLanIp = (ip) => {
  if (!ip) return false;

  if (ip.includes(":") && ip.includes(".")) {
    const lastColonIndex = ip.lastIndexOf(":");
    if (lastColonIndex !== -1) {
      const ipv6Part = ip.slice(0, lastColonIndex);
      const ipv4Part = ip.slice(lastColonIndex + 1);
      return isLocalOrLanIpv6(ipv6Part) || isLocalOrLanIpv4(ipv4Part);
    }
  }

  if (ip.includes(":")) {
    return isLocalOrLanIpv6(ip);
  }

  if (ip.includes(".")) {
    return isLocalOrLanIpv4(ip);
  }

  return false;
};

const formatMaskedIp = (ip) => {
  if (!ip) return "-";

  if (isLocalOrLanIp(ip)) {
    return ip;
  }

  if (ip.includes(":") && ip.includes(".")) {
    const lastColonIndex = ip.lastIndexOf(":");
    if (lastColonIndex !== -1) {
      const ipv6Part = ip.slice(0, lastColonIndex);
      const ipv4Part = ip.slice(lastColonIndex + 1);
      return `${maskIpv6(ipv6Part)}:${maskIpv4(ipv4Part)}`;
    }
  }

  if (ip.includes(":")) {
    return maskIpv6(ip);
  }

  if (ip.includes(".")) {
    return maskIpv4(ip);
  }

  return ip;
};

const loadSites = async () => {
  try {
    const res = await getAllActiveSites();
    siteOptions.value = res.data;
  } catch (error) {
    // 错误已处理
  }
};

// 获取时长参数配置
const loadDurationConfig = async () => {
  try {
    const res = await getDurationConfig();
    durationConfig.value = res.data;
  } catch (error) {
    // 错误已处理
  }
};

const loadFormatConfig = async () => {
  try {
    const res = await getFormatConfig();
    formatConfig.value = res.data;
  } catch (error) {
    // 错误已处理
  }
};

const findFormatParam = (format, siteId, accountId) => {
  if (!format) return null;

  const formatValue = String(format).trim().toLowerCase();

  if (accountId) {
    const accountConfig = formatConfig.value.accounts[`account_${accountId}`];
    if (accountConfig && Array.isArray(accountConfig.params)) {
      const accountParam = accountConfig.params.find(
        (item) => String(item.value || "").trim().toLowerCase() === formatValue,
      );
      if (accountParam) {
        return accountParam;
      }
    }
  }

  if (siteId) {
    const siteConfig = formatConfig.value.sites[`site_${siteId}`];
    if (siteConfig && Array.isArray(siteConfig.params)) {
      const siteParam = siteConfig.params.find(
        (item) => String(item.value || "").trim().toLowerCase() === formatValue,
      );
      if (siteParam) {
        return siteParam;
      }
    }
  }

  return null;
};

const getFormatLabel = (format, siteId, accountId) => {
  if (!format) return "-";

  const formatParam = findFormatParam(format, siteId, accountId);
  if (!formatParam) {
    return format;
  }

  return formatParam.label || format;
};

const getFormatDetailLabel = (format, siteId, accountId) => {
  if (!format) return "-";

  const formatParam = findFormatParam(format, siteId, accountId);
  if (!formatParam) {
    return format;
  }

  const label = formatParam.label || format;
  const value = formatParam.value || format;
  const forwardValue = formatParam.forwardValue || value;
  return `${label}(${value}->${forwardValue})`;
};

// 查找时长参数配置
const findDurationParam = (duration, siteId, accountId) => {
  if (!duration) return null;

  const durationStr = String(duration);

  if (accountId) {
    const accountConfig = durationConfig.value.accounts[`account_${accountId}`];
    if (accountConfig && accountConfig.params) {
      const param = accountConfig.params.find((p) => String(p.times) === durationStr);
      if (param) return param;
    }
  }

  if (siteId) {
    const siteConfig = durationConfig.value.sites[`site_${siteId}`];
    if (siteConfig && siteConfig.params) {
      const param = siteConfig.params.find((p) => String(p.times) === durationStr);
      if (param) return param;
    }
  }

  return null;
};

// 根据网站ID或账号ID获取时长标签
const getDurationLabel = (duration, siteId, accountId) => {
  if (!duration) return "-";

  const param = findDurationParam(duration, siteId, accountId);
  if (param) return param.label;

  return duration;
};

// 获取详情中的时长显示（包含label和转发值）
const getDurationDetailLabel = (duration, siteId, accountId) => {
  if (!duration) return "-";

  const param = findDurationParam(duration, siteId, accountId);
  if (!param) return duration;

  const label = param.label || duration;
  const times = param.times || duration;
  const forwardValue = param.forwardValue || times;

  // 如果没有配置转发值或转发值与原值相同，直接显示 label(times)
  if (forwardValue === String(times)) {
    return `${label} (${times})`;
  }

  // 否则显示 label(times->forwardValue)
  return `${label} (${times}->${forwardValue})`;
};

const loadData = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      success: filters.success,
      siteId: filters.siteId,
    };

    if (filters.dateRange && filters.dateRange.length === 2) {
      params.startDate = filters.dateRange[0];
      params.endDate = filters.dateRange[1];
    }

    if (filters.remark) {
      params.remark = filters.remark;
    }

    const res = await getLogList(params);
    tableData.value = (res.data.list || []).map((item) => ({
      ...item,
      clientIp: formatMaskedIp(item.clientIp),
    }));
    pagination.total = res.data.total;
  } catch (error) {
    // 错误已处理
  } finally {
    loading.value = false;
  }
};

const handleOpenCleanupDialog = () => {
  cleanupDialog.form.cleanupMode = "retainDays";
  cleanupDialog.form.retainDays = 7;
  cleanupDialog.form.dateRange = null;
  cleanupDialog.previewLoading = false;
  cleanupDialog.previewSignature = "";
  cleanupDialog.previewData = null;
  cleanupDialog.visible = true;
};

const handleCloseCleanupDialog = () => {
  cleanupDialog.previewLoading = false;
  cleanupDialog.previewSignature = "";
  cleanupDialog.previewData = null;
  cleanupDialog.visible = false;
};

const disableCleanupDate = (current) => {
  if (!current) return false;

  const currentDate = new Date(current);
  currentDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return currentDate >= today;
};

const resetCleanupPreview = () => {
  cleanupDialog.previewSignature = "";
  cleanupDialog.previewData = null;
};

const buildCleanupPayload = () => {
  const payload = {
    cleanupMode: cleanupDialog.form.cleanupMode,
  };

  if (cleanupDialog.form.cleanupMode === "retainDays") {
    const retainDaysValue = Number.parseInt(cleanupDialog.form.retainDays, 10);
    if (Number.isNaN(retainDaysValue) || retainDaysValue < 1 || retainDaysValue > 3650) {
      Message.warning("保留天数必须是 1 到 3650 之间的整数");
      return null;
    }
    payload.retainDays = retainDaysValue;
  } else {
    if (!cleanupDialog.form.dateRange || cleanupDialog.form.dateRange.length !== 2) {
      Message.warning("请选择需要清理的时间范围");
      return null;
    }
    payload.cleanupStartDate = cleanupDialog.form.dateRange[0];
    payload.cleanupEndDate = cleanupDialog.form.dateRange[1];
  }

  return payload;
};

const getCleanupPreviewSignature = (payload) => JSON.stringify(payload);

watch(
  () => [
    cleanupDialog.visible,
    cleanupDialog.form.cleanupMode,
    cleanupDialog.form.retainDays,
    JSON.stringify(cleanupDialog.form.dateRange || null),
  ],
  (newValue, oldValue) => {
    if (!oldValue || !cleanupDialog.visible) {
      return;
    }

    if (JSON.stringify(newValue.slice(1)) !== JSON.stringify(oldValue.slice(1))) {
      resetCleanupPreview();
    }
  },
);

const handlePreviewCleanupLogs = async () => {
  await nextTick();

  const payload = buildCleanupPayload();
  if (!payload) {
    return;
  }

  cleanupDialog.previewLoading = true;
  try {
    const res = await previewCleanupLogsRequest(payload);
    cleanupDialog.previewData = res.data;
    cleanupDialog.previewSignature = getCleanupPreviewSignature(payload);
    if (res.data.summary.requestCount > 0) {
      Message.success(`预览完成，将删除 ${res.data.summary.requestCount} 条日志`);
    } else {
      Message.info("当前范围内没有可清理日志");
    }
  } catch (error) {
  } finally {
    cleanupDialog.previewLoading = false;
  }
};

const handleCleanupLogs = async () => {
  await nextTick();

  const payload = buildCleanupPayload();
  if (!payload) {
    return;
  }

  if (cleanupDialog.previewSignature !== getCleanupPreviewSignature(payload)) {
    Message.warning("请先预览当前清理范围，确认无误后再执行清理");
    return;
  }

  cleanupDialog.loading = true;
  try {
    const res = await cleanupLogsRequest(payload);
    Message.success(res.message || "清理成功");
    cleanupDialog.visible = false;
    pagination.page = 1;
    await loadData();
  } catch (error) {
  } finally {
    cleanupDialog.loading = false;
  }
};

const handleViewDetail = async (row) => {
  try {
    const res = await getLogDetail(row.id);
    detailDialog.data = res.data;
    detailDialog.visible = true;
  } catch (error) {
    // 错误已处理
  }
};

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
  loadSites();
  loadDurationConfig();
  loadFormatConfig();
  loadData();
  // 计算表格高度
  setTimeout(() => {
    calcTableHeight();
  }, 100);
  window.addEventListener("resize", calcTableHeight);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
  window.removeEventListener("resize", calcTableHeight);
});
</script>

<style scoped>
.log-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.log-list > :deep(.arco-card) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.log-list > :deep(.arco-card-body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.ellipsis-text {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar {
  width: 100%;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: nowrap;
  flex-shrink: 0;
}

/* 为下拉菜单设置固定宽度 */
.toolbar :deep(.arco-select) {
  width: 120px; /* 设置固定宽度 */
}

/* 或者分别设置不同宽度 */
.toolbar .filter-select-auto {
  width: 120px; /* 状态下拉菜单宽度 */
}

.toolbar .filter-select-auto:last-of-type {
  width: 150px; /* 网站下拉菜单宽度（如果是第二个） */
}

/* 日期选择器宽度 */
.toolbar .date-picker {
  width: 240px; /* 日期范围选择器宽度 */
}

/* 备注输入框宽度 */
.toolbar .remark-input {
  width: 150px;
}

/* 搜索按钮保持自动宽度 */
.toolbar .arco-btn {
  flex-shrink: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .toolbar {
    flex-wrap: wrap; /* 移动端允许换行 */
    gap: 8px;
  }

  .toolbar :deep(.arco-select),
  .toolbar .date-picker,
  .toolbar .remark-input {
    width: 100%; /* 移动端占满宽度 */
  }
}
.filter-select-auto {
  width: auto !important;
  min-width: 80px;
}

.filter-select-auto :deep(.arco-select-view) {
  width: auto !important;
}

.filter-select-auto :deep(.arco-select-view-input) {
  width: auto !important;
}

.date-picker {
  flex: 0 0 auto;
}

/* 表格容器 - 固定高度，内部滚动 */
.table-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.table-wrapper :deep(.arco-table-container) {
  height: 100%;
}

.table-wrapper :deep(.arco-table) {
  height: 100%;
}

.table-wrapper :deep(.arco-table-body) {
  overflow-y: auto !important;
}

/* 分页固定在底部 */
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.pagination :deep(.arco-pagination) {
  flex-wrap: wrap;
}

/* 移动端分页器适配 */
@media (max-width: 768px) {
  .pagination {
    justify-content: center;
    overflow-x: auto;
  }

  .pagination :deep(.arco-pagination) {
    justify-content: center;
  }

  .pagination :deep(.arco-pagination-item) {
    min-width: 28px;
    height: 28px;
  }
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

.cleanup-preview {
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  padding: 12px;
  background: #f7f8fa;
}

.cleanup-preview-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin-bottom: 12px;
  color: #1d2129;
  font-size: 13px;
}

.cleanup-preview-days {
  border-top: 1px solid #e5e6eb;
  padding-top: 12px;
}

.cleanup-preview-days-title {
  margin-bottom: 8px;
  color: #4e5969;
  font-size: 13px;
  font-weight: 500;
}

.cleanup-preview-day-list {
  max-height: 220px;
  overflow-y: auto;
}

.cleanup-preview-day-item {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
  color: #1d2129;
  font-size: 13px;
}

.cleanup-preview-day-item:last-child {
  border-bottom: none;
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
  color: #f56c6c;
}

.card-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.card-actions .arco-btn {
  flex: 1;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .toolbar {
    flex-wrap: wrap;
  }

  .filter-select-auto {
    flex: 1;
    min-width: 100px;
  }

  .date-picker {
    width: 100%;
  }

  .toolbar .arco-btn {
    flex: 1;
  }

  .pagination {
    overflow-x: auto;
    justify-content: center;
  }

  .response-preview {
    max-height: 150px;
  }

  .cleanup-preview-summary {
    grid-template-columns: 1fr;
  }
}
</style>
