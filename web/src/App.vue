<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onMounted(async () => {
  // 应用启动时验证 token
  if (authStore.token) {
    await authStore.verify()
  }
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  width: 100%;
  overflow: hidden;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
}

/* 防止移动端橡皮筋效果 */
body {
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  touch-action: pan-y;
}
</style>
