<template>
  <div class="system-config">
    <a-card :bordered="false">
      <template #title>
        <span>系统设置</span>
      </template>

      <a-form :model="form" layout="horizontal" :label-col-props="{ span: isMobile ? 6 : 5 }" :wrapper-col-props="{ span: isMobile ? 18 : 19 }">
        <a-divider orientation="left">安全设置</a-divider>
        <a-form-item label="后台密码">
          <a-input-password v-model="form.admin_password" placeholder="修改后台登录密码" allow-clear />
          <div class="form-tip">留空表示不修改</div>
        </a-form-item>
        <a-form-item label="代理接口Token">
          <a-input v-model="form.proxy_token" placeholder="留空则不验证Token" allow-clear />
          <div class="form-tip">设置后，调用/proxy/get接口时需要携带此Token</div>
        </a-form-item>
        <a-form-item label="IP白名单">
          <a-select
            v-model="form.ip_whitelist"
            multiple
            allow-create
            allow-search
            placeholder="输入IP后回车添加"
            style="width: 100%"
          />
          <div class="form-tip">只有白名单中的IP才能调用代理接口，留空则不限制。支持通配符，如: 192.168.*.*</div>
        </a-form-item>

        <a-divider orientation="left">代理设置</a-divider>
        <a-form-item label="最大失败次数">
          <a-input-number v-model="form.max_fail_count" :min="1" :max="10" :style="{ width: '150px' }" />
          <div class="form-tip">账号连续提取失败超过此次数后自动禁用</div>
        </a-form-item>
        <a-form-item label="失败关键词">
          <a-select
            v-model="form.proxy_failure_keywords"
            multiple
            allow-create
            allow-search
            placeholder="输入关键词后回车添加"
            style="width: 100%"
          />
          <div class="form-tip">当提取响应包含这些关键词时，视为失败并切换账号</div>
        </a-form-item>

        <a-divider orientation="left">定时任务</a-divider>
        <a-form-item label="余额查询间隔">
          <div class="inline-input">
            <a-input-number v-model="form.balance_check_interval" :min="1" :max="1440" :style="{ width: '150px' }" />
            <span class="input-suffix">分钟</span>
          </div>
          <div class="form-tip">定时查询所有账号余额的间隔时间</div>
        </a-form-item>

        <a-form-item :wrapper-col-props="{ offset: isMobile ? 0 : 5 }">
          <a-button type="primary" :loading="saving" @click="handleSave">保存设置</a-button>
        </a-form-item>
      </a-form>

      <a-spin :loading="loading" dot />
    </a-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { getConfig, updateConfig } from '@/api/config'
import { Message } from '@arco-design/web-vue'

const loading = ref(false)
const saving = ref(false)

// 响应式检测
const isMobile = ref(false)
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
}

const form = reactive({
  admin_password: '',
  proxy_token: '',
  ip_whitelist: [],
  max_fail_count: 3,
  proxy_failure_keywords: ['余额不足', '已过期'],
  balance_check_interval: 30
})

const loadConfig = async () => {
  loading.value = true
  try {
    const res = await getConfig()
    const configs = res.data || []
    configs.forEach(item => {
      if (item.key === 'admin_password') {
        form.admin_password = ''
      } else if (item.key === 'proxy_token') {
        form.proxy_token = item.value || ''
      } else if (item.key === 'ip_whitelist') {
        try {
          form.ip_whitelist = JSON.parse(item.value || '[]')
        } catch {
          form.ip_whitelist = []
        }
      } else if (item.key === 'max_fail_count') {
        form.max_fail_count = parseInt(item.value, 10) || 3
      } else if (item.key === 'proxy_failure_keywords') {
        try {
          form.proxy_failure_keywords = JSON.parse(item.value || '["余额不足", "已过期"]')
        } catch {
          form.proxy_failure_keywords = ['余额不足', '已过期']
        }
      } else if (item.key === 'balance_check_interval') {
        form.balance_check_interval = parseInt(item.value, 10) || 30
      }
    })
  } catch (error) {
    // 错误已处理
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    const configs = []

    if (form.admin_password && form.admin_password !== '******') {
      configs.push({ key: 'admin_password', value: form.admin_password })
    }

    configs.push({ key: 'proxy_token', value: form.proxy_token || '' })
    configs.push({ key: 'ip_whitelist', value: JSON.stringify(form.ip_whitelist) })
    configs.push({ key: 'max_fail_count', value: form.max_fail_count.toString() })
    configs.push({ key: 'proxy_failure_keywords', value: JSON.stringify(form.proxy_failure_keywords) })
    configs.push({ key: 'balance_check_interval', value: form.balance_check_interval.toString() })

    await updateConfig(configs)
    Message.success('保存成功')
    form.admin_password = ''
  } catch (error) {
    // 错误已处理
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  loadConfig()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.system-config {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.system-config > .a-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.system-config > :deep(.a-card) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.system-config > :deep(.a-card .a-card-body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.form-tip {
  color: var(--color-text-3);
  font-size: 12px;
  margin-top: 4px;
}

.inline-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-suffix {
  color: var(--color-text-2);
  white-space: nowrap;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .system-config > :deep(.a-card .a-card-body) {
    padding: 12px;
  }

  :deep(.a-divider .a-divider-text) {
    font-size: 14px;
  }

  .inline-input {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .input-suffix {
    margin-left: 0;
  }
}
</style>
