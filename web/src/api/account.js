import request from '@/utils/request'

// 获取账号列表
export const getAccountList = (params) => {
  return request.get('/admin/accounts', { params })
}

// 获取账号统计
export const getAccountStats = () => {
  return request.get('/admin/accounts/stats')
}

// 获取账号详情
export const getAccountDetail = (id) => {
  return request.get(`/admin/accounts/${id}`)
}

// 创建账号
export const createAccount = (data) => {
  return request.post('/admin/accounts', data)
}

// 更新账号
export const updateAccount = (id, data) => {
  return request.put(`/admin/accounts/${id}`, data)
}

// 删除账号
export const deleteAccount = (id) => {
  return request.delete(`/admin/accounts/${id}`)
}

// 切换账号状态
export const toggleAccountStatus = (id) => {
  return request.put(`/admin/accounts/${id}/toggle`)
}

// 刷新账号余额
export const refreshAccountBalance = (id) => {
  return request.post(`/admin/accounts/${id}/refresh-balance`)
}

// 测试账号是否能正常提取并访问网站
export const testAccount = (id) => {
  return request.post(`/admin/accounts/${id}/test`)
}

// 批量刷新余额
export const refreshAllBalance = () => {
  return request.post('/admin/accounts/refresh-all-balance')
}
