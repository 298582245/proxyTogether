import request from '@/utils/request'

// 获取网站列表
export const getSiteList = (params) => {
  return request.get('/admin/sites', { params })
}

// 获取所有启用的网站（下拉选择用）
export const getAllActiveSites = () => {
  return request.get('/admin/sites/all')
}

// 获取网站详情
export const getSiteDetail = (id) => {
  return request.get(`/admin/sites/${id}`)
}

// 创建网站
export const createSite = (data) => {
  return request.post('/admin/sites', data)
}

// 更新网站
export const updateSite = (id, data) => {
  return request.put(`/admin/sites/${id}`, data)
}

// 删除网站
export const deleteSite = (id) => {
  return request.delete(`/admin/sites/${id}`)
}

// 切换网站状态
export const toggleSiteStatus = (id) => {
  return request.put(`/admin/sites/${id}/toggle`)
}

// 获取网站参数提示（用于添加账号时智能提示）
export const getSiteParamHints = (id) => {
  return request.get(`/admin/sites/${id}/param-hints`)
}
