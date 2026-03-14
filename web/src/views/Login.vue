<template>
  <div class="login-container">
    <div class="login-box">
      <h2 class="title">代理统一接口管理系统</h2>
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
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Message } from '@arco-design/web-vue'

const router = useRouter()
const authStore = useAuthStore()

const formRef = ref(null)
const loading = ref(false)
const form = reactive({
  password: ''
})

const rules = {
  password: [{ required: true, message: '请输入密码' }]
}

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
    // 错误已在请求拦截器中处理
  } finally {
    loading.value = false
  }
}
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
