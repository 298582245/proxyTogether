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
