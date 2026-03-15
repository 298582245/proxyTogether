import request from '@/utils/request'

// 获取账号的使用限制
export const getUsageLimit = (accountId) => {
  return request.get(`/admin/usage-limits/${accountId}`)
}

// 设置账号的使用限制
export const setUsageLimit = (accountId, data) => {
  return request.post(`/admin/usage-limits/${accountId}`, data)
}

// 删除账号的使用限制
export const removeUsageLimit = (accountId) => {
  return request.delete(`/admin/usage-limits/${accountId}`)
}

// 重置账号的使用计数
export const resetUsageCount = (accountId) => {
  return request.post(`/admin/usage-limits/${accountId}/reset`)
}

// 获取所有被限制的账号
export const getLimitedAccounts = () => {
  return request.get('/admin/usage-limits')
}
