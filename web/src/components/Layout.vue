<template>
  <div class="layout-container">
    <a-layout>
      <!-- 移动端遮罩 -->
      <div
        v-if="isMobile && sidebarOpen"
        class="sidebar-overlay"
        @click="sidebarOpen = false"
      ></div>

      <!-- 侧边栏 - 桌面端 -->
      <a-layout-sider
        v-if="!isMobile"
        :collapsed="sidebarCollapsed"
        :width="200"
        :collapsed-width="64"
        class="sidebar"
        :trigger="null"
      >
        <div class="logo">
          <span v-if="!sidebarCollapsed">代理管理系统</span>
          <icon-dashboard v-else :size="20" />
        </div>
        <a-menu
          :selected-keys="[activeMenu]"
          :collapsed="sidebarCollapsed"
          :auto-open-selected="true"
          theme="dark"
          @menu-item-click="handleMenuClick"
        >
          <a-menu-item key="/">
            <icon-dashboard />
            <span>仪表盘</span>
          </a-menu-item>
          <a-menu-item key="/sites">
            <icon-link />
            <span>网站管理</span>
          </a-menu-item>
          <a-menu-item key="/accounts">
            <icon-user />
            <span>账号管理</span>
          </a-menu-item>
          <a-menu-item key="/logs">
            <icon-file />
            <span>提取日志</span>
          </a-menu-item>
          <a-menu-item key="/settings">
            <icon-settings />
            <span>系统设置</span>
          </a-menu-item>
        </a-menu>
        <!-- 折叠按钮 -->
        <div class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">
          <icon-left v-if="!sidebarCollapsed" :size="16" />
          <icon-right v-else :size="16" />
        </div>
      </a-layout-sider>

      <!-- 侧边栏 - 移动端抽屉 -->
      <a-drawer
        v-model:visible="sidebarOpen"
        placement="left"
        :footer="false"
        :header="false"
        :width="220"
        :drawer-style="{ padding: '0', background: '#232323' }"
        :unmount-on-close="true"
        :mask-closable="true"
        :closable="false"
        :esc-to-close="false"
        :drawer-class="'mobile-drawer-body'"
        class="mobile-drawer"
      >
        <div class="sidebar mobile-sidebar">
          <div class="logo">
            <span>代理管理系统</span>
          </div>
          <a-menu
            :selected-keys="[activeMenu]"
            theme="dark"
            @menu-item-click="handleMobileMenuClick"
          >
            <a-menu-item key="/">
              <icon-dashboard />
              <span>仪表盘</span>
            </a-menu-item>
            <a-menu-item key="/sites">
              <icon-link />
              <span>网站管理</span>
            </a-menu-item>
            <a-menu-item key="/accounts">
              <icon-user />
              <span>账号管理</span>
            </a-menu-item>
            <a-menu-item key="/logs">
              <icon-file />
              <span>提取日志</span>
            </a-menu-item>
            <a-menu-item key="/settings">
              <icon-settings />
              <span>系统设置</span>
            </a-menu-item>
          </a-menu>
        </div>
      </a-drawer>

      <!-- 主内容区 -->
      <a-layout>
        <!-- 头部 -->
        <a-layout-header class="header">
          <!-- 移动端汉堡菜单 -->
          <div v-if="isMobile" class="hamburger" @click="sidebarOpen = true">
            <icon-menu :size="20" />
          </div>
          <!-- 移动端标题 -->
          <div v-if="isMobile" class="mobile-title">代理管理系统</div>
          <div class="header-right">
            <a-dropdown @select="handleCommand">
              <span class="user-dropdown">
                管理员
                <icon-down />
              </span>
              <template #content>
                <a-doption value="password">修改密码</a-doption>
                <a-doption value="logout">退出登录</a-doption>
              </template>
            </a-dropdown>
          </div>
        </a-layout-header>

        <!-- 内容 -->
        <a-layout-content class="main">
          <router-view />
        </a-layout-content>
      </a-layout>
    </a-layout>

    <!-- 修改密码对话框 -->
    <a-modal v-model:visible="passwordDialog.visible" title="修改密码" :width="400" @ok="handleChangePassword" @cancel="passwordDialog.visible = false">
      <a-form :model="passwordDialog.form" :rules="passwordDialog.rules" ref="passwordFormRef" layout="vertical">
        <a-form-item field="oldPassword" label="旧密码">
          <a-input-password v-model="passwordDialog.form.oldPassword" placeholder="请输入旧密码" />
        </a-form-item>
        <a-form-item field="newPassword" label="新密码">
          <a-input-password v-model="passwordDialog.form.newPassword" placeholder="请输入新密码" />
        </a-form-item>
        <a-form-item field="confirmPassword" label="确认密码">
          <a-input-password v-model="passwordDialog.form.confirmPassword" placeholder="请再次输入新密码" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { changePassword } from '@/api/auth'
import { Message, Modal } from '@arco-design/web-vue'
import {
  IconDashboard,
  IconLink,
  IconUser,
  IconFile,
  IconSettings,
  IconDown,
  IconMenu,
  IconLeft,
  IconRight
} from '@arco-design/web-vue/es/icon'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const activeMenu = computed(() => route.path)

// 响应式布局状态
const isMobile = ref(false)
const sidebarOpen = ref(false)
const sidebarCollapsed = ref(false)

// 检测屏幕宽度
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) {
    sidebarOpen.value = false
  }
}

// 监听窗口变化
onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

// 菜单点击
const handleMenuClick = (key) => {
  router.push(key)
}

const handleMobileMenuClick = (key) => {
  sidebarOpen.value = false
  router.push(key)
}

const passwordFormRef = ref(null)
const passwordDialog = reactive({
  visible: false,
  loading: false,
  form: {
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  },
  rules: {
    oldPassword: [{ required: true, message: '请输入旧密码' }],
    newPassword: [
      { required: true, message: '请输入新密码' },
      { minLength: 6, message: '密码长度不能少于6位' }
    ],
    confirmPassword: [
      { required: true, message: '请确认新密码' },
      {
        validator: (value, callback) => {
          if (value !== passwordDialog.form.newPassword) {
            callback('两次输入的密码不一致')
          } else {
            callback()
          }
        }
      }
    ]
  }
})

const handleCommand = (command) => {
  if (command === 'logout') {
    Modal.confirm({
      title: '提示',
      content: '确定要退出登录吗？',
      onOk: () => {
        authStore.logout()
        router.push('/login')
      }
    })
  } else if (command === 'password') {
    passwordDialog.visible = true
    passwordDialog.form = {
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  }
}

const handleChangePassword = async () => {
  if (!passwordFormRef.value) return

  const valid = await passwordFormRef.value.validate()
  if (valid) return

  passwordDialog.loading = true
  try {
    await changePassword(passwordDialog.form.oldPassword, passwordDialog.form.newPassword)
    Message.success('密码修改成功，请重新登录')
    passwordDialog.visible = false
    authStore.logout()
    router.push('/login')
  } catch (error) {
    // 错误已处理
  } finally {
    passwordDialog.loading = false
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.layout-container :deep(.arco-layout) {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.sidebar {
  background-color: #232323 !important;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}

.sidebar :deep(.arco-menu) {
  height: calc(100% - 60px);
  background-color: transparent;
}

.sidebar :deep(.arco-menu-item) {
  margin: 4px 8px;
  border-radius: 4px;
}

.sidebar :deep(.arco-menu-item.arco-menu-selected) {
  background-color: rgb(var(--primary-6));
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  border-bottom: 1px solid #333;
  white-space: nowrap;
  overflow: hidden;
}

.collapse-btn {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 32px;
  background: #333;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
  cursor: pointer;
  transition: all 0.3s;
}

.collapse-btn:hover {
  background: rgb(var(--primary-6));
  color: #fff;
}

/* 移动端遮罩 */
.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}

/* 移动端抽屉样式 */
.mobile-drawer :deep(.arco-drawer) {
  position: fixed !important;
  left: 0 !important;
  top: 0 !important;
  height: 100vh !important;
  max-width: 220px !important;
  overscroll-behavior: contain;
}

.mobile-drawer :deep(.arco-drawer-wrapper) {
  background-color: transparent;
  overscroll-behavior: contain;
}

.mobile-drawer :deep(.arco-drawer-body) {
  padding: 0 !important;
  background-color: #232323 !important;
  overflow: hidden !important;
  overscroll-behavior: contain;
}

.mobile-drawer :deep(.arco-drawer-content) {
  padding: 0 !important;
  background-color: #232323 !important;
  overflow: hidden !important;
  overscroll-behavior: contain;
}

/* 移动端菜单样式 - 参考 desktop 端的 sidebar */
.mobile-drawer :deep(.arco-menu) {
  background-color: transparent;
  height: calc(100% - 60px);
}

.mobile-drawer :deep(.arco-menu-item) {
  margin: 4px 8px;
  border-radius: 4px;
}

.mobile-drawer :deep(.arco-menu-item.arco-menu-selected) {
  background-color: rgb(var(--primary-6));
}

.mobile-sidebar {
  width: 220px;
  height: 100%;
  background-color: #232323;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

.header {
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 20px;
  height: 60px;
}

.hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  cursor: pointer;
  border-radius: 4px;
  margin-right: auto;
}

.hamburger:hover {
  background: #f5f5f5;
}

.mobile-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1);
  margin-right: auto;
  margin-left: 8px;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-dropdown {
  cursor: pointer;
  display: flex;
  align-items: center;
  color: var(--color-text-1);
  gap: 4px;
}

.main {
  background: #f0f2f5;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.main :deep(> *) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.main :deep(> * > .arco-card) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.main :deep(> * > .arco-card > .arco-card-body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .layout-container {
    overflow: hidden;
  }

  .header {
    padding: 0 16px;
    width: 100%;
    box-sizing: border-box;
  }

  .main {
    padding: 12px 16px;
    width: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
  }

  .user-dropdown {
    font-size: 14px;
  }
}
</style>
