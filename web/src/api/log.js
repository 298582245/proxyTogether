import request from '@/utils/request'

// 获取日志列表
export const getLogList = (params) => {
  return request.get('/admin/logs', { params })
}

// 获取日志详情
export const getLogDetail = (id) => {
  return request.get(`/admin/logs/${id}`)
}

// 获取日志统计
export const getLogStats = (params) => {
  return request.get('/admin/logs/stats', { params })
}

// 获取图表数据
export const getLogChart = (params) => {
  return request.get('/admin/logs/chart', { params })
}

// 获取时长参数配置
export const getDurationConfig = () => {
  return request.get('/admin/logs/duration-config')
}

// 获取格式参数配置
export const getFormatConfig = () => {
  return request.get('/admin/logs/format-config')
}

// 清理日志
export const cleanupLogs = (data) => {
  return request.post('/admin/logs/cleanup', data)
}

// 预览清理日志
export const previewCleanupLogs = (data) => {
  return request.post('/admin/logs/cleanup/preview', data)
}
