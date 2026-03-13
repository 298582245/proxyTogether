<template>
  <div class="account-list">
    <el-card shadow="never">
      <!-- 工具栏 -->
      <div class="toolbar">
        <el-button type="primary" @click="handleAdd">
          <el-icon><Plus /></el-icon>
          添加账号
        </el-button>
        <el-button @click="handleRefreshAllBalance" :loading="refreshing">
          刷新所有余额
        </el-button>
        <el-select v-model="filters.siteId" placeholder="选择网站" clearable style="width: 150px; margin-left: 12px" @change="loadData">
          <el-option v-for="site in siteOptions" :key="site.id" :label="site.name" :value="site.id" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px; margin-left: 12px" @change="loadData">
          <el-option label="全部" value="" />
          <el-option label="启用" :value="1" />
          <el-option label="禁用" :value="0" />
        </el-select>
        <el-input v-model="filters.name" placeholder="搜索账号名称" clearable style="width: 200px; margin-left: 12px" @keyup.enter="loadData" />
      </div>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="账号名称" min-width="120" />
        <el-table-column prop="site" label="所属网站" width="120">
          <template #default="{ row }">
            {{ row.site?.name || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="balance" label="余额" width="120" align="right">
          <template #default="{ row }">
            <template v-if="row.site && row.site.balanceType === 'monthly'">
              <el-tag type="info" size="small">包月</el-tag>
            </template>
            <template v-else>
              <span :class="{ 'low-balance': Number(row.balance) < 10 }">{{ Number(row.balance || 0).toFixed(2) }}</span>
            </template>
          </template>
        </el-table-column>
        <el-table-column prop="failCount" label="失败次数" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.failCount >= 3 ? 'danger' : row.failCount > 0 ? 'warning' : 'success'" size="small">
              {{ row.failCount }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="balanceUpdatedAt" label="余额更新时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.balanceUpdatedAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button type="success" link size="small" @click="handleRefreshBalance(row)" :loading="row.refreshing">
              刷新余额
            </el-button>
            <el-button
              :type="row.status === 1 ? 'warning' : 'success'"
              link
              size="small"
              @click="handleToggleStatus(row)"
            >
              {{ row.status === 1 ? '禁用' : '启用' }}
            </el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑账号' : '添加账号'" width="650px" destroy-on-close>
      <el-form :model="dialog.form" :rules="dialog.rules" ref="formRef" label-width="100px">
        <el-form-item label="所属网站" prop="siteId">
          <el-select v-model="dialog.form.siteId" placeholder="请选择网站" style="width: 100%" :disabled="dialog.isEdit" @change="handleSiteChange">
            <el-option v-for="site in siteOptions" :key="site.id" :label="site.name" :value="site.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="账号名称" prop="name">
          <el-input v-model="dialog.form.name" placeholder="账号备注名称" />
        </el-form-item>

        <!-- 智能参数提示 -->
        <template v-if="paramHints.extractParams.length > 0">
          <el-divider content-position="left">提取参数</el-divider>
          <el-alert type="info" :closable="false" style="margin-bottom: 12px">
            请填写以下参数，这些参数会替换到提取链接模板中
          </el-alert>
          <el-form-item v-for="param in paramHints.extractParams" :key="param" :label="param">
            <el-input v-model="dialog.form.extractParamValues[param]" :placeholder="`请输入 ${param}`" @input="syncExtractParams" />
          </el-form-item>
        </template>

        <template v-if="paramHints.balanceParams.length > 0">
          <el-divider content-position="left">余额查询参数</el-divider>
          <el-alert type="info" :closable="false" style="margin-bottom: 12px">
            请填写以下参数，这些参数会替换到余额查询接口中
          </el-alert>
          <el-form-item v-for="param in paramHints.balanceParams" :key="param" :label="param">
            <el-input v-model="dialog.form.balanceParamValues[param]" :placeholder="`请输入 ${param}`" @input="syncBalanceParams" />
          </el-form-item>
        </template>

        <!-- 时长参数提示 -->
        <template v-if="paramHints.durationParams.length > 0">
          <el-divider content-position="left">可用时长</el-divider>
          <div style="margin-bottom: 12px;">
            <el-tag v-for="item in paramHints.durationParams" :key="item.times" style="margin-right: 8px; margin-bottom: 4px;">
              {{ item.label }} ({{ item.times }}分钟)
            </el-tag>
          </div>
          <div class="form-tip">调用代理接口时使用 times 参数选择对应时长，如 times=1 表示1分钟</div>
        </template>

        <el-divider content-position="left">高级设置</el-divider>
        <el-form-item label="提取参数">
          <el-input
            v-model="dialog.form.extractParamsStr"
            type="textarea"
            :rows="3"
            placeholder='JSON格式，可手动编辑'
          />
          <div class="form-tip">
            上方填写的参数会自动同步到这里，也可以直接编辑JSON
          </div>
        </el-form-item>
        <el-form-item label="余额参数">
          <el-input
            v-model="dialog.form.balanceParamsStr"
            type="textarea"
            :rows="3"
            placeholder='JSON格式，可手动编辑'
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="dialog.form.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="dialog.loading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getAccountList, getAccountDetail, createAccount, updateAccount, deleteAccount, toggleAccountStatus, refreshAccountBalance, refreshAllBalance } from '@/api/account'
import { getAllActiveSites, getSiteParamHints } from '@/api/site'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const loading = ref(false)
const refreshing = ref(false)
const tableData = ref([])
const siteOptions = ref([])
const formRef = ref(null)

const filters = reactive({
  siteId: '',
  status: '',
  name: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

// 参数提示
const paramHints = reactive({
  extractParams: [],
  balanceParams: [],
  durationParams: [],
  formatParams: []
})

const dialog = reactive({
  visible: false,
  isEdit: false,
  loading: false,
  form: {
    siteId: '',
    name: '',
    extractParamValues: {},
    balanceParamValues: {},
    extractParamsStr: '',
    balanceParamsStr: '',
    status: 1
  },
  rules: {
    siteId: [{ required: true, message: '请选择网站', trigger: 'change' }]
  }
})

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}

const loadSites = async () => {
  try {
    const res = await getAllActiveSites()
    siteOptions.value = res.data
  } catch (error) {
    // 错误已处理
  }
}

const loadData = async () => {
  loading.value = true
  try {
    const res = await getAccountList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      siteId: filters.siteId,
      status: filters.status,
      name: filters.name
    })
    tableData.value = res.data.list.map(item => ({ ...item, refreshing: false }))
    pagination.total = res.data.total
  } catch (error) {
    // 错误已处理
  } finally {
    loading.value = false
  }
}

// 加载网站参数提示
const handleSiteChange = async (siteId) => {
  // 重置参数
  paramHints.extractParams = []
  paramHints.balanceParams = []
  paramHints.durationParams = []
  paramHints.formatParams = []
  dialog.form.extractParamValues = {}
  dialog.form.balanceParamValues = {}
  dialog.form.extractParamsStr = ''
  dialog.form.balanceParamsStr = ''

  if (!siteId) {
    return
  }

  try {
    const res = await getSiteParamHints(siteId)
    console.log('参数提示:', res.data)

    paramHints.extractParams = res.data.extractParams || []
    paramHints.balanceParams = res.data.balanceParams || []
    paramHints.durationParams = res.data.durationParams || []
    paramHints.formatParams = res.data.formatParams || []

    // 初始化参数值对象
    const extractValues = {}
    const balanceValues = {}
    paramHints.extractParams.forEach(p => {
      extractValues[p] = ''
    })
    paramHints.balanceParams.forEach(p => {
      balanceValues[p] = ''
    })
    dialog.form.extractParamValues = extractValues
    dialog.form.balanceParamValues = balanceValues

    console.log('提取参数:', paramHints.extractParams)
    console.log('余额参数:', paramHints.balanceParams)
  } catch (error) {
    console.error('获取参数提示失败:', error)
    // 错误已处理
  }
}

// 同步提取参数到JSON
const syncExtractParams = () => {
  const params = {}
  Object.entries(dialog.form.extractParamValues).forEach(([key, value]) => {
    if (value) params[key] = value
  })
  dialog.form.extractParamsStr = Object.keys(params).length > 0 ? JSON.stringify(params, null, 2) : ''
}

// 同步余额参数到JSON
const syncBalanceParams = () => {
  const params = {}
  Object.entries(dialog.form.balanceParamValues).forEach(([key, value]) => {
    if (value) params[key] = value
  })
  dialog.form.balanceParamsStr = Object.keys(params).length > 0 ? JSON.stringify(params, null, 2) : ''
}

const resetForm = () => {
  dialog.form = {
    siteId: '',
    name: '',
    extractParamValues: {},
    balanceParamValues: {},
    extractParamsStr: '',
    balanceParamsStr: '',
    status: 1
  }
  paramHints.extractParams = []
  paramHints.balanceParams = []
  paramHints.durationParams = []
  paramHints.formatParams = []
}

const handleAdd = () => {
  resetForm()
  dialog.isEdit = false
  dialog.visible = true
}

const handleEdit = async (row) => {
  try {
    const res = await getAccountDetail(row.id)
    const data = res.data

    // 加载参数提示
    if (data.siteId) {
      await handleSiteChange(data.siteId)
    }

    // 解析现有参数
    let extractParams = {}
    let balanceParams = {}
    if (data.extractParams) {
      try {
        extractParams = typeof data.extractParams === 'string' ? JSON.parse(data.extractParams) : data.extractParams
      } catch {}
    }
    if (data.balanceParams) {
      try {
        balanceParams = typeof data.balanceParams === 'string' ? JSON.parse(data.balanceParams) : data.balanceParams
      } catch {}
    }

    dialog.form = {
      siteId: data.siteId,
      name: data.name || '',
      extractParamValues: { ...extractParams },
      balanceParamValues: { ...balanceParams },
      extractParamsStr: data.extractParams ? JSON.stringify(extractParams, null, 2) : '',
      balanceParamsStr: data.balanceParams ? JSON.stringify(balanceParams, null, 2) : '',
      status: data.status
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

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    dialog.loading = true
    try {
      const data = {
        siteId: dialog.form.siteId,
        name: dialog.form.name,
        status: dialog.form.status
      }

      // 优先使用JSON字符串，如果为空则从参数值构建
      if (dialog.form.extractParamsStr && dialog.form.extractParamsStr.trim()) {
        try {
          data.extractParams = JSON.parse(dialog.form.extractParamsStr)
        } catch {
          ElMessage.error('提取参数JSON格式错误')
          return
        }
      } else {
        const params = {}
        Object.entries(dialog.form.extractParamValues).forEach(([key, value]) => {
          if (value) params[key] = value
        })
        data.extractParams = Object.keys(params).length > 0 ? params : null
      }

      if (dialog.form.balanceParamsStr && dialog.form.balanceParamsStr.trim()) {
        try {
          data.balanceParams = JSON.parse(dialog.form.balanceParamsStr)
        } catch {
          ElMessage.error('余额参数JSON格式错误')
          return
        }
      } else {
        const params = {}
        Object.entries(dialog.form.balanceParamValues).forEach(([key, value]) => {
          if (value) params[key] = value
        })
        data.balanceParams = Object.keys(params).length > 0 ? params : null
      }

      if (dialog.isEdit) {
        await updateAccount(dialog.editId, data)
        ElMessage.success('更新成功')
      } else {
        await createAccount(data)
        ElMessage.success('创建成功')
      }
      dialog.visible = false
      loadData()
    } catch (error) {
      // 错误已处理
    } finally {
      dialog.loading = false
    }
  })
}

const handleToggleStatus = async (row) => {
  try {
    await toggleAccountStatus(row.id)
    ElMessage.success('状态更新成功')
    loadData()
  } catch (error) {
    // 错误已处理
  }
}

const handleDelete = (row) => {
  ElMessageBox.confirm('确定要删除该账号吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await deleteAccount(row.id)
      ElMessage.success('删除成功')
      loadData()
    } catch (error) {
      // 错误已处理
    }
  })
}

const handleRefreshBalance = async (row) => {
  row.refreshing = true
  try {
    const res = await refreshAccountBalance(row.id)
    if (res.success) {
      ElMessage.success(`余额刷新成功: ${res.data.balance}`)
      loadData()
    }
  } catch (error) {
    // 错误已处理
  } finally {
    row.refreshing = false
  }
}

const handleRefreshAllBalance = async () => {
  refreshing.value = true
  try {
    await refreshAllBalance()
    ElMessage.success('已开始刷新所有余额，请稍后刷新页面查看')
  } catch (error) {
    // 错误已处理
  } finally {
    refreshing.value = false
  }
}

onMounted(() => {
  loadSites()
  loadData()
})
</script>

<style scoped>
.account-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.account-list > .el-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.account-list > .el-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.account-list > .el-card :deep(.el-table__wrapper) {
  flex: 1;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px 0;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.form-tip {
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
}

.low-balance {
  color: #F56C6C;
  font-weight: bold;
}
</style>
