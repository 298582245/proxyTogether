<template>
  <div class="database-maintenance">
    <a-card :bordered="false" class="maintenance-card">
      <template #title>数据库维护</template>

      <div class="maintenance-content">
        <a-alert type="warning" show-icon class="section-card">
          数据库导入会覆盖当前数据。导入前后端会自动生成 pre_import 备份，但不会自动回滚。
        </a-alert>

        <a-card title="手动导出/备份" class="section-card">
          <a-space wrap>
            <a-button type="primary" :loading="backupLoading" :disabled="operationRunning" @click="handleRunBackup">
              立即备份
            </a-button>
            <a-button :loading="exportLoading" :disabled="operationRunning" @click="handleExportDatabase">
              导出并下载
            </a-button>
            <a-button @click="loadOperationStatus">刷新任务状态</a-button>
          </a-space>
          <div class="status-line">
            当前任务：
            <a-tag :color="operationStatus.running ? 'orangered' : 'green'">
              {{ operationStatus.running ? operationStatus.operation?.type || '执行中' : '空闲' }}
            </a-tag>
            <span v-if="operationStatus.operation?.startedAt" class="status-time">
              开始于 {{ formatDateTime(operationStatus.operation.startedAt) }}
            </span>
          </div>
        </a-card>

        <a-card title="导入恢复" class="section-card">
          <a-form layout="vertical">
            <a-form-item label="SQL 文件">
              <input ref="fileInputRef" type="file" accept=".sql" :disabled="operationRunning || importLoading" @change="handleFileChange" />
              <template #extra>
                <span class="form-tip">仅支持 .sql，最大 {{ form.maxUploadMb }} MB</span>
              </template>
            </a-form-item>
            <a-form-item>
              <a-checkbox v-model="confirmOverwrite" :disabled="operationRunning || importLoading">
                我已确认导入会覆盖当前数据库，并已了解导入失败不会自动回滚
              </a-checkbox>
            </a-form-item>
            <a-button
              status="danger"
              :loading="importLoading"
              :disabled="operationRunning || !selectedFile || !confirmOverwrite"
              @click="handleImportDatabase"
            >
              上传并导入
            </a-button>
          </a-form>
        </a-card>

        <a-card title="自动备份配置" class="section-card">
          <a-form :model="form" layout="vertical" class="config-form">
            <a-form-item label="启用自动备份">
              <a-switch v-model="form.enabled" />
            </a-form-item>
            <a-form-item label="调度模式">
              <a-radio-group v-model="form.mode">
                <a-radio value="daily">每天固定时间</a-radio>
                <a-radio value="interval">每 N 小时</a-radio>
              </a-radio-group>
            </a-form-item>
            <a-form-item v-if="form.mode === 'daily'" label="执行时间">
              <div class="inline-input">
                <a-input-number v-model="form.hour" :min="0" :max="23" style="width: 100px" />
                <span class="input-suffix">时</span>
                <a-input-number v-model="form.minute" :min="0" :max="59" style="width: 100px" />
                <span class="input-suffix">分</span>
              </div>
            </a-form-item>
            <a-form-item v-else label="间隔小时">
              <div class="inline-input">
                <a-input-number v-model="form.intervalHours" :min="1" :max="168" style="width: 150px" />
                <span class="input-suffix">小时</span>
                <a-input-number v-model="form.minute" :min="0" :max="59" style="width: 100px" />
                <span class="input-suffix">分触发</span>
              </div>
            </a-form-item>
            <a-form-item label="本地保留份数">
              <a-input-number v-model="form.retentionCount" :min="1" :max="365" style="width: 150px" />
            </a-form-item>
            <a-form-item label="备份目录">
              <a-input v-model="form.directory" placeholder="backups/database" style="max-width: 420px" />
              <template #extra>
                <span class="form-tip">目录相对于 server 目录，不允许包含 .. 或通配符</span>
              </template>
            </a-form-item>
            <a-form-item label="最大上传大小">
              <div class="inline-input">
                <a-input-number v-model="form.maxUploadMb" :min="1" :max="2048" style="width: 150px" />
                <span class="input-suffix">MB</span>
              </div>
            </a-form-item>
            <a-form-item label="最近自动备份">
              <div class="last-result">
                <div>时间：{{ form.lastRunAt ? formatDateTime(form.lastRunAt) : '-' }}</div>
                <div>结果：{{ form.lastResult || '-' }}</div>
              </div>
            </a-form-item>
            <a-button type="primary" :loading="configSaving" @click="handleSaveConfig">保存配置</a-button>
          </a-form>
        </a-card>

        <a-card title="本地备份列表" class="section-card">
          <template #extra>
            <a-button size="small" @click="loadBackups">刷新</a-button>
          </template>
          <a-table :data="backups" :loading="listLoading" :pagination="false" :bordered="{ wrapper: true }" row-key="fileName">
            <template #columns>
              <a-table-column title="文件名" data-index="fileName" :min-width="260" />
              <a-table-column title="类型" data-index="type" :width="110" align="center">
                <template #cell="{ record }">
                  <a-tag>{{ formatType(record.type) }}</a-tag>
                </template>
              </a-table-column>
              <a-table-column title="大小" data-index="size" :width="120" align="center">
                <template #cell="{ record }">{{ formatSize(record.size) }}</template>
              </a-table-column>
              <a-table-column title="创建时间" data-index="createdAt" :width="190" align="center">
                <template #cell="{ record }">{{ formatDateTime(record.createdAt) }}</template>
              </a-table-column>
              <a-table-column title="操作" :width="140" align="center">
                <template #cell="{ record }">
                  <a-space>
                    <a-link @click="handleDownload(record)">下载</a-link>
                    <a-popconfirm content="确定删除该备份文件吗？" @ok="handleDelete(record)">
                      <a-link status="danger">删除</a-link>
                    </a-popconfirm>
                  </a-space>
                </template>
              </a-table-column>
            </template>
          </a-table>
        </a-card>
      </div>

      <a-spin :loading="loading" dot />
    </a-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import {
  deleteBackup,
  downloadBackup,
  exportDatabase,
  getBackupConfig,
  getOperationStatus,
  importDatabase,
  listBackups,
  runBackup,
  updateBackupConfig,
} from '@/api/database'

const loading = ref(false)
const backupLoading = ref(false)
const exportLoading = ref(false)
const importLoading = ref(false)
const configSaving = ref(false)
const listLoading = ref(false)
const selectedFile = ref(null)
const fileInputRef = ref(null)
const confirmOverwrite = ref(false)
const backups = ref([])

const form = reactive({
  enabled: false,
  mode: 'daily',
  hour: 3,
  minute: 30,
  intervalHours: 24,
  retentionCount: 7,
  directory: 'backups/database',
  maxUploadMb: 100,
  lastRunAt: '',
  lastResult: '',
})

const operationStatus = reactive({
  running: false,
  operation: null,
})

const operationRunning = computed(() => operationStatus.running || importLoading.value || backupLoading.value || exportLoading.value)

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

const formatSize = (size) => {
  const value = Number(size || 0)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`
  return `${value} B`
}

const formatType = (type) => {
  const map = {
    auto: '自动备份',
    manual: '手动备份',
    export: '导出文件',
    pre_import: '导入前备份',
  }
  return map[type] || type
}

const loadConfig = async () => {
  const res = await getBackupConfig()
  const data = res.data || {}
  form.enabled = Boolean(data.enabled)
  form.mode = data.mode || 'daily'
  form.hour = data.hour ?? 3
  form.minute = data.minute ?? 30
  form.intervalHours = data.intervalHours ?? 24
  form.retentionCount = data.retentionCount ?? 7
  form.directory = data.directory || 'backups/database'
  form.maxUploadMb = data.maxUploadMb ?? 100
  form.lastRunAt = data.lastRunAt || ''
  form.lastResult = data.lastResult || ''
}

const loadBackups = async () => {
  listLoading.value = true
  try {
    const res = await listBackups()
    backups.value = res.data || []
  } catch (error) {
    // 错误已处理
  } finally {
    listLoading.value = false
  }
}

const loadOperationStatus = async () => {
  const res = await getOperationStatus()
  operationStatus.running = Boolean(res.data?.running)
  operationStatus.operation = res.data?.operation || null
}

const loadAll = async () => {
  loading.value = true
  try {
    await Promise.all([loadConfig(), loadBackups(), loadOperationStatus()])
  } finally {
    loading.value = false
  }
}

const handleSaveConfig = async () => {
  configSaving.value = true
  try {
    const configs = [
      { key: 'database_backup_enabled', value: form.enabled ? '1' : '0' },
      { key: 'database_backup_mode', value: form.mode },
      { key: 'database_backup_hour', value: String(form.hour) },
      { key: 'database_backup_minute', value: String(form.minute) },
      { key: 'database_backup_interval_hours', value: String(form.intervalHours) },
      { key: 'database_backup_retention_count', value: String(form.retentionCount) },
      { key: 'database_backup_directory', value: form.directory },
      { key: 'database_backup_max_upload_mb', value: String(form.maxUploadMb) },
    ]
    await updateBackupConfig(configs)
    Message.success('配置已保存并生效')
    await loadConfig()
  } catch (error) {
    // 错误已处理
  } finally {
    configSaving.value = false
  }
}

const handleRunBackup = async () => {
  backupLoading.value = true
  try {
    const res = await runBackup()
    Message.success(`备份完成：${res.data.fileName}`)
    await Promise.all([loadBackups(), loadOperationStatus()])
  } catch (error) {
    await loadOperationStatus()
  } finally {
    backupLoading.value = false
  }
}

const handleExportDatabase = async () => {
  exportLoading.value = true
  try {
    const res = await exportDatabase()
    await downloadBackup(res.data.fileName)
    Message.success('导出完成')
    await Promise.all([loadBackups(), loadOperationStatus()])
  } catch (error) {
    await loadOperationStatus()
  } finally {
    exportLoading.value = false
  }
}

const handleFileChange = (event) => {
  const file = event.target.files && event.target.files[0]
  selectedFile.value = file || null
}

const handleImportDatabase = async () => {
  if (!selectedFile.value) {
    Message.error('请选择 .sql 文件')
    return
  }
  if (!selectedFile.value.name.toLowerCase().endsWith('.sql')) {
    Message.error('只支持 .sql 文件')
    return
  }
  if (!confirmOverwrite.value) {
    Message.error('请先勾选风险确认')
    return
  }

  importLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    formData.append('confirmOverwrite', 'true')
    await importDatabase(formData)
    Message.success('数据库导入完成')
    selectedFile.value = null
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
    confirmOverwrite.value = false
    await Promise.all([loadBackups(), loadConfig(), loadOperationStatus()])
  } catch (error) {
    await loadOperationStatus()
  } finally {
    importLoading.value = false
  }
}

const handleDownload = async (record) => {
  await downloadBackup(record.fileName)
}

const handleDelete = async (record) => {
  await deleteBackup(record.fileName)
  Message.success('删除成功')
  await loadBackups()
}

onMounted(() => {
  loadAll()
})
</script>

<style scoped>
.database-maintenance {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.maintenance-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  margin: 0;
}

.maintenance-card :deep(.arco-card-body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 20px;
  overflow: hidden;
}

.maintenance-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
  margin-right: -8px;
}

.section-card {
  margin-bottom: 16px;
}

.config-form {
  max-width: 640px;
}

.inline-input {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.input-suffix,
.form-tip,
.status-time {
  color: var(--color-text-3);
}

.status-line {
  margin-top: 12px;
}

.status-time {
  margin-left: 8px;
}

.last-result {
  color: var(--color-text-2);
  line-height: 1.8;
}

@media (max-width: 768px) {
  .maintenance-card :deep(.arco-card-body) {
    padding: 12px;
  }
}
</style>
