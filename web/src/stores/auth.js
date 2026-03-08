import { defineStore } from 'pinia'
import { login as loginApi, verifyToken } from '@/api/auth'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    isLoggedIn: false
  }),

  actions: {
    async login(password) {
      const res = await loginApi(password)
      this.token = res.data.token
      this.isLoggedIn = true
      localStorage.setItem('token', res.data.token)
      return res
    },

    async verify() {
      if (!this.token) {
        this.isLoggedIn = false
        return false
      }
      try {
        await verifyToken()
        this.isLoggedIn = true
        return true
      } catch {
        this.logout()
        return false
      }
    },

    logout() {
      this.token = ''
      this.isLoggedIn = false
      localStorage.removeItem('token')
    }
  }
})
