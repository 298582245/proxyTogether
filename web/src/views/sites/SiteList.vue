<template>
  <div class="site-list">
    <a-card :bordered="false">
      <!-- 工具栏 -->
      <div class="toolbar">
        <a-button type="primary" @click="handleAdd">
          <template #icon><icon-plus /></template>
          <span class="btn-text">添加网站</span>
        </a-button>
        <a-select v-model="filters.status" placeholder="状态" allow-clear class="filter-select-auto" @change="loadData">
          <a-option label="全部" value="" />
          <a-option :value="1">启用</a-option>
          <a-option :value="0">禁用</a-option>
        </a-select>
      </div>

      <!-- 桌面端表格 -->
      <div v-if="!isMobile" class="table-wrapper" ref="tableWrapperRef">
        <a-table
          :data="tableData"
          :loading="loading"
          :pagination="false"
          :stripe="true"
          :scroll="{ y: tableScrollY }"
          style="width: 100%"
        >
        <template #columns>
          <a-table-column title="ID" data-index="id" :width="80" />
          <a-table-column title="网站名称" data-index="name" :min-width="120" />
          <a-table-column title="余额类型" :width="100" align="center">
            <template #cell="{ record }">
              <a-tag :color="record.balanceType === 'monthly' ? 'gray' : 'green'">
                {{ record.balanceType === 'monthly' ? '包月' : '余额' }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="余额查询接口" :min-width="200" ellipsis>
            <template #cell="{ record }">
              {{ record.balanceType === 'monthly' ? '包月无需配置' : (record.balanceUrl || '-') }}
            </template>
          </a-table-column>
          <a-table-column title="格式参数" :min-width="150">
            <template #cell="{ record }">
              <template v-if="record.formatParams && record.formatParams.length">
                <a-tag v-for="item in record.formatParams" :key="item.value" size="small" style="margin-right: 4px">
                  {{ item.label }}
                </a-tag>
              </template>
              <span v-else>-</span>
            </template>
          </a-table-column>
          <a-table-column title="时长参数" :min-width="150">
            <template #cell="{ record }">
              <template v-if="record.durationParams && record.durationParams.length">
                <a-tag v-for="item in record.durationParams.slice(0, 3)" :key="item.times" size="small" style="margin-right: 4px">
                  {{ item.label }}({{ item.times }}分钟)
                </a-tag>
                <span v-if="record.durationParams.length > 3">...</span>
              </template>
              <span v-else>-</span>
            </template>
          </a-table-column>
          <a-table-column title="账号数" data-index="accountCount" :width="100" align="center" />
          <a-table-column title="状态" :width="100" align="center">
            <template #cell="{ record }">
              <a-tag :color="record.status === 1 ? 'green' : 'red'">
                {{ record.status === 1 ? '启用' : '禁用' }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column title="创建时间" :width="160">
            <template #cell="{ record }">
              {{ formatDate(record.createdAt) }}
            </template>
          </a-table-column>
          <a-table-column title="操作" :width="200" fixed="right">
            <template #cell="{ record }">
              <a-space>
                <a-link @click="handleEdit(record)">编辑</a-link>
                <a-link :status="record.status === 1 ? 'warning' : 'success'" @click="handleToggleStatus(record)">
                  {{ record.status === 1 ? '禁用' : '启用' }}
                </a-link>
                <a-link status="danger" @click="handleDelete(record)">删除</a-link>
              </a-space>
            </template>
          </a-table-column>
        </template>
      </a-table>
      </div>

      <!-- 移动端卡片列表 -->
      <div v-else class="mobile-card-wrapper">
        <a-spin :loading="loading" style="width: 100%">
          <div class="mobile-card-list">
            <div v-for="item in tableData" :key="item.id" class="mobile-card">
            <div class="card-header">
              <span class="card-title">{{ item.name }}</span>
              <a-tag :color="item.status === 1 ? 'green' : 'red'" size="small">
                {{ item.status === 1 ? '启用' : '禁用' }}
              </a-tag>
            </div>
            <div class="card-body">
              <div class="card-row">
                <span class="card-label">ID:</span>
                <span class="card-value">{{ item.id }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">余额类型:</span>
                <a-tag :color="item.balanceType === 'monthly' ? 'gray' : 'green'" size="small">
                  {{ item.balanceType === 'monthly' ? '包月' : '余额' }}
                </a-tag>
              </div>
              <div class="card-row">
                <span class="card-label">账号数:</span>
                <span class="card-value">{{ item.accountCount }}</span>
              </div>
              <div class="card-row">
                <span class="card-label">创建时间:</span>
                <span class="card-value">{{ formatDate(item.createdAt) }}</span>
              </div>
              <div class="card-row" v-if="item.formatParams && item.formatParams.length">
                <span class="card-label">格式参数:</span>
                <div class="card-tags">
                  <a-tag v-for="tag in item.formatParams" :key="tag.value" size="small">
                    {{ tag.label }}
                  </a-tag>
                </div>
              </div>
            </div>
            <div class="card-actions">
              <a-button type="primary" size="small" @click="handleEdit(item)">编辑</a-button>
              <a-button
                :status="item.status === 1 ? 'warning' : 'success'"
                size="small"
                @click="handleToggleStatus(item)"
              >
                {{ item.status === 1 ? '禁用' : '启用' }}
              </a-button>
              <a-button status="danger" size="small" @click="handleDelete(item)">删除</a-button>
            </div>
          </div>
          <a-empty v-if="!loading && tableData.length === 0" description="暂无数据" />
          </div>
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
          :simple="isMobile"
          @change="loadData"
          @page-size-change="loadData"
        />
      </div>
    </a-card>

    <!-- 编辑对话框 -->
    <a-modal
      v-model:visible="dialog.visible"
      :title="dialog.isEdit ? '编辑网站' : '添加网站'"
      :width="isMobile ? '95%' : 640"
      @ok="handleSubmit"
      @cancel="dialog.visible = false"
      :mask-closable="false"
    >
      <a-form
        :model="dialog.form"
        :rules="dialog.rules"
        ref="formRef"
        layout="vertical"
      >
        <a-form-item field="name" label="网站名称" required>
          <a-input v-model="dialog.form.name" placeholder="请输入网站名称" />
        </a-form-item>

        <a-form-item field="extractUrlTemplate" label="提取链接模板" required>
          <a-textarea
            v-model="dialog.form.extractUrlTemplate"
            :auto-size="{ minRows: 2, maxRows: 4 }"
            placeholder="支持变量: {times}, {format}, {params.xxx}"
          />
          <template #extra>
            <span class="form-tip">示例: https://api.example.com/get?num=1&amp;format={format}&amp;minute={times}&amp;no={params.no}</span>
          </template>
        </a-form-item>

        <a-form-item label="格式参数">
          <div class="param-group">
            <div v-for="(item, index) in dialog.form.formatParams" :key="index" class="param-row">
              <a-input v-model="item.label" placeholder="显示名称" class="param-input" />
              <a-input v-model="item.value" placeholder="参数值" class="param-input" />
              <a-button type="text" status="danger" size="small" @click="dialog.form.formatParams.splice(index, 1)">
                <template #icon><icon-delete /></template>
              </a-button>
            </div>
            <a-button type="dashed" long @click="dialog.form.formatParams.push({ label: '', value: '' })">
              <template #icon><icon-plus /></template>
              添加格式参数
            </a-button>
          </div>
        </a-form-item>

        <a-form-item label="时长参数">
          <div class="param-group">
            <div v-for="(item, index) in dialog.form.durationParams" :key="index" class="param-row">
              <a-input v-model="item.label" placeholder="显示名称" class="param-input-sm" />
              <a-input-number v-model="item.times" placeholder="分钟" class="param-input-sm" :min="1" />
              <span class="param-unit">分钟</span>
              <a-input-number v-model="item.price" placeholder="价格" class="param-input-sm" :min="0" :precision="4" />
              <span class="param-unit">元</span>
              <a-button type="text" status="danger" size="small" @click="dialog.form.durationParams.splice(index, 1)">
                <template #icon><icon-delete /></template>
              </a-button>
            </div>
            <a-button type="dashed" long @click="dialog.form.durationParams.push({ label: '', times: undefined, price: undefined })">
              <template #icon><icon-plus /></template>
              添加时长参数
            </a-button>
          </div>
        </a-form-item>

        <a-divider>余额查询配置</a-divider>

        <a-form-item label="余额类型">
          <a-radio-group v-model="dialog.form.balanceType" type="button">
            <a-radio value="balance">余额查询</a-radio>
            <a-radio value="monthly">包月</a-radio>
          </a-radio-group>
          <template #extra>
            <span class="form-tip">包月类型无需配置余额查询接口，余额显示为空</span>
          </template>
        </a-form-item>

        <template v-if="dialog.form.balanceType === 'balance'">
          <a-form-item label="余额接口URL">
            <a-input v-model="dialog.form.balanceUrl" placeholder="余额查询接口地址，支持 {params.xxx} 参数" />
            <template #extra>
              <span class="form-tip">示例: https://api.example.com/balance?no={params.no}&amp;userId={params.userId}</span>
            </template>
          </a-form-item>
          <a-form-item label="请求方法">
            <a-radio-group v-model="dialog.form.balanceMethod" type="button">
              <a-radio value="GET">GET</a-radio>
              <a-radio value="POST">POST</a-radio>
            </a-radio-group>
          </a-form-item>
          <a-form-item label="余额字段路径">
            <a-input v-model="dialog.form.balanceField" placeholder="如: data.balance" />
            <template #extra>
              <span class="form-tip">接口返回JSON中余额字段的路径，用点号分隔</span>
            </template>
          </a-form-item>
        </template>

        <a-divider>失败关键词</a-divider>

        <a-form-item label="失败关键词">
          <a-select
            v-model="dialog.form.failureKeywords"
            multiple
            allow-create
            allow-search
            placeholder="输入关键词后回车添加"
          />
          <template #extra>
            <span class="form-tip">当提取响应包含这些关键词时，自动切换到下一个账号</span>
          </template>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { getSiteList, getSiteDetail, createSite, updateSite, deleteSite, toggleSiteStatus } from '@/api/site'
import { formatLocalizedDateTime } from '@/utils/date'
import { Message, Modal } from '@arco-design/web-vue'
import { IconPlus, IconDelete } from '@arco-design/web-vue/es/icon'

const loading = ref(false)
const tableData = ref([])
const formRef = ref(null)
const tableWrapperRef = ref(null)
const tableScrollY = ref(300)

// 响应式检测
const isMobile = ref(false)
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
}

// 计算表格滚动高度
const calcTableHeight = () => {
  if (tableWrapperRef.value) {
    const wrapperHeight = tableWrapperRef.value.clientHeight
    tableScrollY.value = wrapperHeight - 50
  }
}

const filters = reactive({
  status: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const dialog = reactive({
  visible: false,
  isEdit: false,
  loading: false,
  form: {
    name: '',
    extractUrlTemplate: '',
    formatParams: [],
    durationParams: [],
    balanceType: 'balance',
    balanceUrl: '',
    balanceMethod: 'GET',
    balanceField: 'data.balance',
    failureKeywords: []
  },
  rules: {
    name: [{ required: true, message: '请输入网站名称' }],
    extractUrlTemplate: [{ required: true, message: '请输入提取链接模板' }]
  }
})

const formatDate = (date) => formatLocalizedDateTime(date)

const loadData = async () => {
  loading.value = true
  try {
    const res = await getSiteList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: filters.status
    })
    tableData.value = res.data.list
    pagination.total = res.data.total
  } catch (error) {
    // 错误已处理
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  dialog.form = {
    name: '',
    extractUrlTemplate: '',
    formatParams: [
      { label: '纯IP', value: 'txt' },
      { label: 'JSON', value: 'JSON' }
    ],
    durationParams: [],
    balanceType: 'balance',
    balanceUrl: '',
    balanceMethod: 'GET',
    balanceField: 'data.balance',
    failureKeywords: []
  }
}

const handleAdd = () => {
  resetForm()
  dialog.isEdit = false
  dialog.visible = true
}

const handleEdit = async (row) => {
  try {
    const res = await getSiteDetail(row.id)
    const data = res.data
    dialog.form = {
      name: data.name,
      extractUrlTemplate: data.extractUrlTemplate,
      formatParams: data.formatParams || [],
      durationParams: data.durationParams || [],
      balanceType: data.balanceType || 'balance',
      balanceUrl: data.balanceUrl || '',
      balanceMethod: data.balanceMethod || 'GET',
      balanceField: data.balanceField || 'data.balance',
      failureKeywords: data.failureKeywords || []
    }
    dialog.isEdit = true
    dialog.editId = data.id
    dialog.visible = true
  } catch (error) {
    // 错误已处理
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return

  const valid = await formRef.value.validate()
  if (valid) return

  dialog.loading = true
  try {
    const data = { ...dialog.form }

    if (dialog.isEdit) {
      await updateSite(dialog.editId, data)
      Message.success('更新成功')
    } else {
      await createSite(data)
      Message.success('创建成功')
    }
    dialog.visible = false
    loadData()
  } catch (error) {
    // 错误已处理
  } finally {
    dialog.loading = false
  }
}

const handleToggleStatus = async (row) => {
  try {
    await toggleSiteStatus(row.id)
    Message.success('状态更新成功')
    loadData()
  } catch (error) {
    // 错误已处理
  }
}

const handleDelete = (row) => {
  Modal.confirm({
    title: '提示',
    content: '确定要删除该网站吗？',
    onOk: async () => {
      try {
        await deleteSite(row.id)
        Message.success('删除成功')
        loadData()
      } catch (error) {
        // 错误已处理
      }
    }
  })
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  loadData()
  // 计算表格高度
  setTimeout(() => {
    calcTableHeight()
  }, 100)
  window.addEventListener('resize', calcTableHeight)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  window.removeEventListener('resize', calcTableHeight)
})
</script>

<style scoped>
.site-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.site-list > :deep(.arco-card) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.site-list > :deep(.arco-card-body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
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
}

/* 表单样式 */
.form-tip {
  color: var(--color-text-3);
  font-size: 12px;
  line-height: 1.5;
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-fill-1);
  border-radius: 4px;
}

.param-input {
  flex: 1;
}

.param-input-sm {
  width: 100px;
}

.param-unit {
  color: var(--color-text-3);
  font-size: 13px;
  flex-shrink: 0;
}

/* 移动端卡片样式 */
.mobile-card-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mobile-card-wrapper :deep(.arco-spin) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mobile-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.mobile-card {
  background: var(--color-bg-1);
  border: 1px solid var(--color-border);
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
  border-bottom: 1px solid var(--color-border);
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1);
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
  color: var(--color-text-3);
  font-size: 13px;
  min-width: 70px;
  flex-shrink: 0;
}

.card-value {
  color: var(--color-text-2);
  font-size: 13px;
  word-break: break-all;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.card-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.card-actions :deep(.arco-btn) {
  flex: 1;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .toolbar {
    flex-wrap: wrap;
  }

  .toolbar :deep(.arco-btn) {
    flex: 1;
  }

  .filter-select-auto {
    flex: 1;
    min-width: 100px;
  }

  .btn-text {
    display: inline;
  }

  .pagination {
    overflow-x: auto;
    justify-content: center;
  }

  .param-row {
    flex-wrap: wrap;
    padding: 12px;
  }

  .param-input-sm {
    width: calc(50% - 20px);
  }

  .param-unit {
    width: 30px;
  }
}
</style>
