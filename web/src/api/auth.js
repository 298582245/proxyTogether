import request from '@/utils/request'

// 登录
export const login = (password) => {
  return request.post('/admin/auth/login', { password })
}

// 验证Token
export const verifyToken = () => {
  return request.get('/admin/auth/verify')
}

// 修改密码
export const changePassword = (oldPassword, newPassword) => {
  return request.put('/admin/auth/password', { oldPassword, newPassword })
}
