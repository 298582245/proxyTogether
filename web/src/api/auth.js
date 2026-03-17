import request from '@/utils/request'

// 检查密码初始化状态
export const checkPasswordInit = () => {
  return request.get('/admin/auth/init')
}

// 初始化密码（首次设置）
export const initPassword = (password) => {
  return request.post('/admin/auth/init', { password })
}

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
