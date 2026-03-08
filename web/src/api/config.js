import request from '@/utils/request'

// 获取系统配置
export const getConfig = () => {
  return request.get('/admin/config')
}

// 更新系统配置
export const updateConfig = (configs) => {
  return request.put('/admin/config', { configs })
}

// 获取单个配置值
export const getConfigValue = (key) => {
  return request.get(`/admin/config/${key}`)
}
