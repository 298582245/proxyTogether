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
          <template v-if="!sidebarCollapsed">代理管理系统</template>
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
            <template #icon><icon-dashboard /></template>
            仪表盘
          </a-menu-item>
          <a-menu-item key="/sites">
            <template #icon><icon-link /></template>
            网站管理
          </a-menu-item>
          <a-menu-item key="/accounts">
            <template #icon><icon-user /></template>
            账号管理
          </a-menu-item>
          <a-menu-item key="/logs">
            <template #icon><icon-file /></template>
            提取日志
          </a-menu-item>
          <a-menu-item key="/settings">
            <template #icon><icon-settings /></template>
            系统设置
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
        :unmount-on-close="true"
        :mask-closable="true"
        :closable="false"
        :esc-to-close="false"
        class="mobile-drawer"
      >
        <div class="mobile-menu-wrapper">
          <div class="mobile-logo">代理管理系统</div>
          <a-menu
            :selected-keys="[activeMenu]"
            theme="dark"
            @menu-item-click="handleMobileMenuClick"
          >
            <a-menu-item key="/">
              <template #icon><icon-dashboard /></template>
              仪表盘
            </a-menu-item>
            <a-menu-item key="/sites">
              <template #icon><icon-link /></template>
              网站管理
            </a-menu-item>
            <a-menu-item key="/accounts">
              <template #icon><icon-user /></template>
              账号管理
            </a-menu-item>
            <a-menu-item key="/logs">
              <template #icon><icon-file /></template>
              提取日志
            </a-menu-item>
            <a-menu-item key="/settings">
              <template #icon><icon-settings /></template>
              系统设置
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
    <a-modal
      v-model:visible="passwordDialog.visible"
      title="修改密码"
      :width="400"
      @ok="handleChangePassword"
      @cancel="passwordDialog.visible = false"
    >
      <a-form
        :model="passwordDialog.form"
        :rules="passwordDialog.rules"
        ref="passwordFormRef"
        layout="vertical"
      >
        <a-form-item field="oldPassword" label="旧密码">
          <a-input-password
            v-model="passwordDialog.form.oldPassword"
            placeholder="请输入旧密码"
          />
        </a-form-item>
        <a-form-item field="newPassword" label="新密码">
          <a-input-password
            v-model="passwordDialog.form.newPassword"
            placeholder="请输入新密码"
          />
        </a-form-item>
        <a-form-item field="confirmPassword" label="确认密码">
          <a-input-password
            v-model="passwordDialog.form.confirmPassword"
            placeholder="请再次输入新密码"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { changePassword } from "@/api/auth";
import { Message, Modal } from "@arco-design/web-vue";
import {
  IconDashboard,
  IconLink,
  IconUser,
  IconFile,
  IconSettings,
  IconDown,
  IconMenu,
  IconLeft,
  IconRight,
} from "@arco-design/web-vue/es/icon";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const activeMenu = computed(() => route.path);

// 响应式布局状态
const isMobile = ref(false);
const sidebarOpen = ref(false);
const sidebarCollapsed = ref(false);

// 检测屏幕宽度
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
  if (!isMobile.value) {
    sidebarOpen.value = false;
  }
};

// 监听窗口变化
onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
});

// 菜单点击
const handleMenuClick = (key) => {
  router.push(key);
};

const handleMobileMenuClick = (key) => {
  sidebarOpen.value = false;
  router.push(key);
};

const passwordFormRef = ref(null);
const passwordDialog = reactive({
  visible: false,
  loading: false,
  form: {
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  },
  rules: {
    oldPassword: [{ required: true, message: "请输入旧密码" }],
    newPassword: [
      { required: true, message: "请输入新密码" },
      { minLength: 6, message: "密码长度不能少于6位" },
    ],
    confirmPassword: [
      { required: true, message: "请确认新密码" },
      {
        validator: (value, callback) => {
          if (value !== passwordDialog.form.newPassword) {
            callback("两次输入的密码不一致");
          } else {
            callback();
          }
        },
      },
    ],
  },
});

const handleCommand = (command) => {
  if (command === "logout") {
    Modal.confirm({
      title: "提示",
      content: "确定要退出登录吗？",
      onOk: () => {
        authStore.logout();
        router.push("/login");
      },
    });
  } else if (command === "password") {
    passwordDialog.visible = true;
    passwordDialog.form = {
      oldPassword: "",
      newPassword: "",
      confirmPassword: "",
    };
  }
};

const handleChangePassword = async () => {
  if (!passwordFormRef.value) return;

  const valid = await passwordFormRef.value.validate();
  if (valid) return;

  passwordDialog.loading = true;
  try {
    await changePassword(
      passwordDialog.form.oldPassword,
      passwordDialog.form.newPassword
    );
    Message.success("密码修改成功，请重新登录");
    passwordDialog.visible = false;
    authStore.logout();
    router.push("/login");
  } catch (error) {
    // 错误已处理
  } finally {
    passwordDialog.loading = false;
  }
};
</script>

<style scoped>
.layout-container {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.layout-container :deep(.arco-layout) {
  height: 100%;
}

/* ========== 桌面端侧栏 ========== */
.sidebar {
  background-color: #232323 !important;
  height: 100%;
}

.sidebar :deep(.arco-menu) {
  background-color: transparent;
}

.sidebar :deep(.arco-menu-item) {
  margin: 4px 8px;
  border-radius: 4px;
}

.sidebar :deep(.arco-menu-item.arco-menu-selected) {
  background-color: rgb(var(--primary-6));
}

/* 折叠状态下菜单项居中 */
.sidebar :deep(.arco-menu-collapsed .arco-menu-item) {
  margin: 4px 6px;
  padding: 0 !important;
}

.sidebar :deep(.arco-menu-collapsed .arco-menu-item .arco-menu-icon) {
  margin-right: 0 !important;
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
  z-index: 10;
}

.collapse-btn:hover {
  background: rgb(var(--primary-6));
  color: #fff;
}

/* ========== 移动端遮罩 ========== */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}

/* ========== 移动端抽屉 ========== */
.mobile-drawer :deep(.arco-drawer) {
  width: 220px !important;
}

.mobile-drawer :deep(.arco-drawer-body) {
  padding: 0 !important;
  background: #232323 !important;
}

.mobile-menu-wrapper {
  width: 220px;
  height: 100%;
  background: #232323;
  overflow: hidden;
}

.mobile-logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  border-bottom: 1px solid #333;
}

.mobile-menu-wrapper :deep(.arco-menu) {
  background: transparent;
}

.mobile-menu-wrapper :deep(.arco-menu-item) {
  margin: 4px 8px;
  border-radius: 4px;
}

.mobile-menu-wrapper :deep(.arco-menu-item.arco-menu-selected) {
  background-color: rgb(var(--primary-6));
}

/* ========== 头部 ========== */
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
  gap: 4px;
}

/* ========== 主内容区 ========== */
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

/* ========== 移动端适配 ========== */
@media (max-width: 768px) {
  .header {
    padding: 0 16px;
  }

  .main {
    padding: 12px 16px;
    overflow-x: hidden;
  }

  .user-dropdown {
    font-size: 14px;
  }
}
</style>

<!-- 全局样式覆盖 Arco Design 默认样式 -->
<style>
/* 手机端抽屉 body 的 padding */
.mobile-drawer .arco-drawer-body {
  padding: 0 !important;
}

/* 电脑端折叠菜单项样式 */
.sidebar .arco-menu-collapsed .arco-menu-item {
  padding: 0 !important;
  text-align: center !important;
}

.sidebar .arco-menu-collapsed .arco-menu-item .arco-menu-icon {
  margin-right: 0 !important;
}
</style>
