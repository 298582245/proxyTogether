<template>
  <div class="site-list">
    <el-card shadow="never">
      <!-- 工具栏 -->
      <div class="toolbar">
        <el-button type="primary" @click="handleAdd">
          <el-icon><Plus /></el-icon>
          添加网站
        </el-button>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px; margin-left: 12px" @change="loadData">
          <el-option label="全部" value="" />
          <el-option label="启用" :value="1" />
          <el-option label="禁用" :value="0" />
        </el-select>
      </div>

      <!-- 表格 -->
      <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="网站名称" min-width="120" />
        <el-table-column prop="balanceUrl" label="余额查询接口" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.balanceUrl || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="formatParams" label="格式参数" min-width="150">
          <template #default="{ row }">
            <template v-if="row.formatParams && row.formatParams.length">
              <el-tag v-for="item in row.formatParams" :key="item.value" size="small" style="margin-right: 4px">
                {{ item.label }}
              </el-tag>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="durationParams" label="时长参数" min-width="150">
          <template #default="{ row }">
            <template v-if="row.durationParams && row.durationParams.length">
              <el-tag v-for="item in row.durationParams.slice(0, 3)" :key="item.times" size="small" style="margin-right: 4px">
                {{ item.label }}({{ item.times }}分钟)
              </el-tag>
              <span v-if="row.durationParams.length > 3">...</span>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="accountCount" label="账号数" width="100" align="center" />
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
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleEdit(row)">编辑</el-button>
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
    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑网站' : '添加网站'" width="700px" destroy-on-close>
      <el-form :model="dialog.form" :rules="dialog.rules" ref="formRef" label-width="120px">
        <el-form-item label="网站名称" prop="name">
          <el-input v-model="dialog.form.name" placeholder="请输入网站名称" />
        </el-form-item>
        <el-form-item label="提取链接模板" prop="extractUrlTemplate">
          <el-input
            v-model="dialog.form.extractUrlTemplate"
            type="textarea"
            :rows="3"
            placeholder="支持变量: {times}, {format}, {params.xxx}"
          />
          <div class="form-tip">
            示例: https://api.example.com/get?num=1&amp;format={format}&amp;minute={times}&amp;no={params.no}&amp;secret={params.secret}
          </div>
        </el-form-item>
        <el-form-item label="格式参数">
          <div v-for="(item, index) in dialog.form.formatParams" :key="index" class="param-item">
            <el-input v-model="item.label" placeholder="显示名称" style="width: 100px" />
            <el-input v-model="item.value" placeholder="参数值" style="width: 100px; margin-left: 8px" />
            <el-button type="danger" link @click="dialog.form.formatParams.splice(index, 1)" style="margin-left: 8px">
              删除
            </el-button>
          </div>
          <el-button type="primary" link @click="dialog.form.formatParams.push({ label: '', value: '' })">
            + 添加格式参数
          </el-button>
        </el-form-item>
        <el-form-item label="时长参数">
          <div v-for="(item, index) in dialog.form.durationParams" :key="index" class="param-item">
            <el-input v-model="item.label" placeholder="显示名称" style="width: 100px" />
            <el-input v-model="item.times" placeholder="分钟数" style="width: 80px; margin-left: 8px" />
            <span style="margin-left: 4px; color: #909399;">分钟</span>
            <el-input v-model="item.price" placeholder="价格" style="width: 80px; margin-left: 8px" />
            <span style="margin-left: 4px; color: #909399;">元</span>
            <el-button type="danger" link @click="dialog.form.durationParams.splice(index, 1)" style="margin-left: 8px">
              删除
            </el-button>
          </div>
          <el-button type="primary" link @click="dialog.form.durationParams.push({ label: '', times: '', price: '' })">
            + 添加时长参数
          </el-button>
        </el-form-item>
        <el-divider content-position="left">余额查询配置</el-divider>
        <el-form-item label="余额接口URL">
          <el-input v-model="dialog.form.balanceUrl" placeholder="余额查询接口地址，支持 {params.xxx} 参数" />
          <div class="form-tip">示例: https://api.example.com/balance?no={params.no}&amp;userId={params.userId}</div>
        </el-form-item>
        <el-form-item label="请求方法">
          <el-radio-group v-model="dialog.form.balanceMethod">
            <el-radio value="GET">GET</el-radio>
            <el-radio value="POST">POST</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="余额字段路径">
          <el-input v-model="dialog.form.balanceField" placeholder="如: data.balance" />
          <div class="form-tip">接口返回JSON中余额字段的路径，用点号分隔</div>
        </el-form-item>
        <el-divider content-position="left">失败关键词</el-divider>
        <el-form-item label="失败关键词">
          <el-select
            v-model="dialog.form.failureKeywords"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入关键词后回车添加"
            style="width: 100%"
          />
          <div class="form-tip">当提取响应包含这些关键词时，自动切换到下一个账号</div>
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
import { getSiteList, getSiteDetail, createSite, updateSite, deleteSite, toggleSiteStatus } from '@/api/site'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const loading = ref(false)
const tableData = ref([])
const formRef = ref(null)

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
    balanceUrl: '',
    balanceMethod: 'GET',
    balanceField: 'data.balance',
    failureKeywords: []
  },
  rules: {
    name: [{ required: true, message: '请输入网站名称', trigger: 'blur' }],
    extractUrlTemplate: [{ required: true, message: '请输入提取链接模板', trigger: 'blur' }]
  }
})

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}

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
    formatParams: [],
    durationParams: [],
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

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    dialog.loading = true
    try {
      const data = { ...dialog.form }

      if (dialog.isEdit) {
        await updateSite(dialog.editId, data)
        ElMessage.success('更新成功')
      } else {
        await createSite(data)
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
    await toggleSiteStatus(row.id)
    ElMessage.success('状态更新成功')
    loadData()
  } catch (error) {
    // 错误已处理
  }
}

const handleDelete = (row) => {
  ElMessageBox.confirm('确定要删除该网站吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await deleteSite(row.id)
      ElMessage.success('删除成功')
      loadData()
    } catch (error) {
      // 错误已处理
    }
  })
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.site-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.site-list > .el-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.site-list > .el-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.site-list > .el-card :deep(.el-table__wrapper) {
  flex: 1;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
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
  line-height: 1.5;
}

.param-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
</style>
