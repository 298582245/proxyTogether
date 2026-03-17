<template>
  <div class="login-container">
    <div class="login-box">
      <h2 class="title">代理统一接口管理系统</h2>

      <!-- 初始化密码表单 -->
      <template v-if="needInit">
        <a-form :model="initForm" :rules="initRules" ref="initFormRef" @submit-success="handleInit" layout="vertical">
          <a-alert type="warning" style="margin-bottom: 20px">
            首次使用，请设置管理员密码
          </a-alert>
          <a-form-item field="password" label="密码" hide-asterisk>
            <a-input-password
              v-model="initForm.password"
              placeholder="请输入密码（至少6位）"
              size="large"
              allow-clear
            />
          </a-form-item>
          <a-form-item field="confirmPassword" label="确认密码" hide-asterisk>
            <a-input-password
              v-model="initForm.confirmPassword"
              placeholder="请再次输入密码"
              size="large"
              allow-clear
            />
          </a-form-item>
          <a-form-item>
            <a-button
              type="primary"
              size="large"
              :loading="loading"
              long
              html-type="submit"
            >
              设置密码并登录
            </a-button>
          </a-form-item>
        </a-form>
      </template>

      <!-- 登录表单 -->
      <template v-else>
        <a-form :model="form" :rules="rules" ref="formRef" @submit-success="handleLogin" layout="vertical">
          <a-form-item field="password" hide-label>
            <a-input-password
              v-model="form.password"
              placeholder="请输入密码"
              size="large"
              allow-clear
            />
          </a-form-item>
          <a-form-item>
            <a-button
              type="primary"
              size="large"
              :loading="loading"
              long
              html-type="submit"
            >
              登 录
            </a-button>
          </a-form-item>
        </a-form>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Message } from '@arco-design/web-vue'
import { checkPasswordInit, initPassword } from '@/api/auth'

const router = useRouter()
const authStore = useAuthStore()

const formRef = ref(null)
const initFormRef = ref(null)
const loading = ref(false)
const needInit = ref(false)

const form = reactive({
  password: ''
})

const initForm = reactive({
  password: '',
  confirmPassword: ''
})

const rules = {
  password: [{ required: true, message: '请输入密码' }]
}

const initRules = {
  password: [
    { required: true, message: '请输入密码' },
    { minLength: 6, message: '密码长度不能少于6位' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码' },
    {
      validator: (value, callback) => {
        if (value !== initForm.password) {
          callback('两次输入的密码不一致')
        } else {
          callback()
        }
      }
    }
  ]
}

// 检查是否需要初始化密码
const checkInit = async () => {
  try {
    const res = await checkPasswordInit()
    needInit.value = res.data?.needInit || false
  } catch (error) {
    // 检查失败，默认显示登录表单
    needInit.value = false
  }
}

// 处理密码初始化
const handleInit = async () => {
  if (!initFormRef.value) return

  const valid = await initFormRef.value.validate()
  if (valid) return

  loading.value = true
  try {
    await initPassword(initForm.password)
    Message.success('密码设置成功')
    // 初始化成功后自动登录
    await authStore.login(initForm.password)
    router.push('/')
  } catch (error) {
    // 错误已在请求拦截器中处理
  } finally {
    loading.value = false
  }
}

// 处理登录
const handleLogin = async () => {
  if (!formRef.value) return

  const valid = await formRef.value.validate()
  if (valid) return

  loading.value = true
  try {
    await authStore.login(form.password)
    Message.success('登录成功')
    router.push('/')
  } catch (error) {
    // 如果返回needInit，显示初始化表单
    if (error.response?.data?.needInit) {
      needInit.value = true
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  checkInit()
})
</script>

<style scoped>
.login-container {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #165DFF 0%, #722ED1 100%);
  padding: 20px;
}

.login-box {
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.title {
  text-align: center;
  margin-bottom: 30px;
  color: var(--color-text-1);
  font-size: 24px;
  font-weight: 600;
}

/* 移动端适配 */
@media (max-width: 480px) {
  .login-box {
    padding: 24px 20px;
    border-radius: 12px;
  }

  .title {
    font-size: 20px;
    margin-bottom: 24px;
  }
}
</style>
