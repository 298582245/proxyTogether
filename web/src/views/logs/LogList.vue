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
                  >{{ getDurationLabel(item.duration, item.siteId, item.accountId) }} / {{ item.format || "-" }}</span
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
          detailDialog.data.format
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
import { ref, reactive, onMounted, onUnmounted } from "vue";
import { getLogList, getLogDetail, getDurationConfig } from "@/api/log";
import { getAllActiveSites } from "@/api/site";
import { IconSearch } from "@arco-design/web-vue/es/icon";

const loading = ref(false);
const tableData = ref([]);
const siteOptions = ref([]);
const tableWrapperRef = ref(null);
const tableScrollY = ref(300);
const durationConfig = ref({ sites: {}, accounts: {} });

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

// 表格列配置
const columns = [
  { title: "ID", dataIndex: "id", width: 80 },
  { title: "网站", dataIndex: "site", width: 120, slotName: "site" },
  { title: "账号", dataIndex: "account", width: 120, slotName: "account" },
  { title: "客户端IP", dataIndex: "clientIp", width: 140 },
  { title: "时长参数", dataIndex: "duration", width: 100, align: "center", slotName: "duration" },
  { title: "格式参数", dataIndex: "format", width: 100, align: "center" },
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

// 根据网站ID或账号ID获取时长标签
const getDurationLabel = (duration, siteId, accountId) => {
  if (!duration) return "-";

  // 将duration转为字符串进行比较
  const durationStr = String(duration);

  // 先尝试从独立包月账号配置中查找
  if (accountId) {
    const accountConfig = durationConfig.value.accounts[`account_${accountId}`];
    if (accountConfig && accountConfig.params) {
      const param = accountConfig.params.find((p) => String(p.times) === durationStr);
      if (param) return param.label;
    }
  }

  // 再从网站配置中查找
  if (siteId) {
    const siteConfig = durationConfig.value.sites[`site_${siteId}`];
    if (siteConfig && siteConfig.params) {
      const param = siteConfig.params.find((p) => String(p.times) === durationStr);
      if (param) return param.label;
    }
  }

  // 如果没有找到配置，返回原始值
  return duration;
};

// 获取详情中的时长显示（包含label和原始值）
const getDurationDetailLabel = (duration, siteId, accountId) => {
  if (!duration) return "-";
  const label = getDurationLabel(duration, siteId, accountId);
  // 如果label和duration相同，说明没有配置，直接返回
  if (label === duration) return duration;
  // 否则返回 label(duration)
  return `${label} (${duration})`;
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
}
</style>
