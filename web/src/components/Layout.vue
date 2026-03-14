<template>
  <div class="layout-container">
    <el-container>
      <!-- 移动端遮罩 -->
      <div
        v-if="isMobile && sidebarOpen"
        class="sidebar-overlay"
        @click="sidebarOpen = false"
      ></div>

      <!-- 侧边栏 - 桌面端 -->
      <el-aside
        v-if="!isMobile"
        :width="sidebarCollapsed ? '64px' : '200px'"
        class="sidebar"
      >
        <div class="logo">
          <span v-if="!sidebarCollapsed">代理管理系统</span>
          <el-icon v-else size="20"><DataAnalysis /></el-icon>
        </div>
        <el-menu
          :default-active="activeMenu"
          :collapse="sidebarCollapsed"
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409EFF"
          router
        >
          <el-menu-item index="/">
            <el-icon><DataAnalysis /></el-icon>
            <template #title>仪表盘</template>
          </el-menu-item>
          <el-menu-item index="/sites">
            <el-icon><Link /></el-icon>
            <template #title>网站管理</template>
          </el-menu-item>
          <el-menu-item index="/accounts">
            <el-icon><User /></el-icon>
            <template #title>账号管理</template>
          </el-menu-item>
          <el-menu-item index="/logs">
            <el-icon><Document /></el-icon>
            <template #title>提取日志</template>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <template #title>系统设置</template>
          </el-menu-item>
        </el-menu>
        <!-- 折叠按钮 -->
        <div class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">
          <el-icon :size="16">
            <ArrowLeft v-if="!sidebarCollapsed" />
            <ArrowRight v-else />
          </el-icon>
        </div>
      </el-aside>

      <!-- 侧边栏 - 移动端抽屉 -->
      <el-drawer
        v-model="sidebarOpen"
        direction="ltr"
        :with-header="false"
        :size="220"
        class="mobile-drawer"
      >
        <div class="sidebar mobile-sidebar">
          <div class="logo">
            <span>代理管理系统</span>
          </div>
          <el-menu
            :default-active="activeMenu"
            background-color="#304156"
            text-color="#bfcbd9"
            active-text-color="#409EFF"
            router
            @select="sidebarOpen = false"
          >
            <el-menu-item index="/">
              <el-icon><DataAnalysis /></el-icon>
              <span>仪表盘</span>
            </el-menu-item>
            <el-menu-item index="/sites">
              <el-icon><Link /></el-icon>
              <span>网站管理</span>
            </el-menu-item>
            <el-menu-item index="/accounts">
              <el-icon><User /></el-icon>
              <span>账号管理</span>
            </el-menu-item>
            <el-menu-item index="/logs">
              <el-icon><Document /></el-icon>
              <span>提取日志</span>
            </el-menu-item>
            <el-menu-item index="/settings">
              <el-icon><Setting /></el-icon>
              <span>系统设置</span>
            </el-menu-item>
          </el-menu>
        </div>
      </el-drawer>

      <!-- 主内容区 -->
      <el-container>
        <!-- 头部 -->
        <el-header class="header">
          <!-- 移动端汉堡菜单 -->
          <div v-if="isMobile" class="hamburger" @click="sidebarOpen = true">
            <el-icon :size="20"><Expand /></el-icon>
          </div>
          <!-- 移动端标题 -->
          <div v-if="isMobile" class="mobile-title">代理管理系统</div>
          <div class="header-right">
            <el-dropdown @command="handleCommand">
              <span class="user-dropdown">
                管理员
                <el-icon><ArrowDown /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="password">修改密码</el-dropdown-item>
                  <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>

        <!-- 内容 -->
        <el-main class="main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>

    <!-- 修改密码对话框 -->
    <el-dialog v-model="passwordDialog.visible" title="修改密码" width="400px">
      <el-form :model="passwordDialog.form" :rules="passwordDialog.rules" ref="passwordFormRef">
        <el-form-item label="旧密码" prop="oldPassword">
          <el-input v-model="passwordDialog.form.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="passwordDialog.form.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="passwordDialog.form.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="passwordDialog.loading" @click="handleChangePassword">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { changePassword } from '@/api/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DataAnalysis, Link, User, Document, Setting, ArrowDown, Expand, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

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
    oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
    newPassword: [
      { required: true, message: '请输入新密码', trigger: 'blur' },
      { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
    ],
    confirmPassword: [
      { required: true, message: '请确认新密码', trigger: 'blur' },
      {
        validator: (rule, value, callback) => {
          if (value !== passwordDialog.form.newPassword) {
            callback(new Error('两次输入的密码不一致'))
          } else {
            callback()
          }
        },
        trigger: 'blur'
      }
    ]
  }
})

const handleCommand = (command) => {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      authStore.logout()
      router.push('/login')
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

  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return

    passwordDialog.loading = true
    try {
      await changePassword(passwordDialog.form.oldPassword, passwordDialog.form.newPassword)
      ElMessage.success('密码修改成功，请重新登录')
      passwordDialog.visible = false
      authStore.logout()
      router.push('/login')
    } catch (error) {
      // 错误已处理
    } finally {
      passwordDialog.loading = false
    }
  })
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.layout-container .el-container {
  height: 100%;
}

.sidebar {
  background-color: #304156;
  height: 100%;
  transition: width 0.3s ease;
  position: relative;
  display: flex;
  flex-direction: column;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  border-bottom: 1px solid #3a4a5d;
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
  background: #3a4a5d;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bfcbd9;
  cursor: pointer;
  transition: all 0.3s;
}

.collapse-btn:hover {
  background: #409EFF;
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
:deep(.mobile-drawer) {
  .el-drawer__body {
    padding: 0;
  }
}

.mobile-sidebar {
  width: 220px;
  height: 100%;
}

.header {
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 20px;
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
  color: #303133;
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
  color: #333;
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

.main :deep(> * > .el-card) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.main :deep(> * > .el-card > .el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .header {
    padding: 0 12px;
  }

  .main {
    padding: 12px;
  }

  .user-dropdown {
    font-size: 14px;
  }
}
</style>
