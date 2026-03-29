import request from '@/utils/request'

export const getStatsSnapshotOptions = () => {
  return request.get('/admin/stats-snapshot/options')
}

export const getStatsSnapshotDetail = (params) => {
  return request.get('/admin/stats-snapshot/detail', { params })
}

export const refreshStatsSnapshot = (data) => {
  return request.post('/admin/stats-snapshot/refresh', data)
}

// 新统计方案接口
export const getRealtimeStats = (params) => {
  return request.get('/admin/stats-snapshot/realtime', { params })
}

export const clearTodayCache = (params) => {
  return request.delete('/admin/stats-snapshot/today-cache', { params })
}

export const triggerDailySettlement = (data) => {
  return request.post('/admin/stats-snapshot/daily-settlement', data)
}

export const triggerBatchSettlement = (data) => {
  return request.post('/admin/stats-snapshot/batch-settlement', data)
}

export const triggerMonthlySettlement = () => {
  return request.post('/admin/stats-snapshot/monthly-settlement')
}

// 清空新方案所有数据
export const clearAllNewStats = () => {
  return request.delete('/admin/stats-snapshot/all-new-stats')
}

// 新增统计接口（类似 stats API）
export const getStatsOverviewNew = () => {
  return request.get('/admin/stats-snapshot/overview')
}

export const getDashboardChartNew = (params) => {
  return request.get('/admin/stats-snapshot/dashboard-chart', { params })
}

export const getAccountSuccessRankingNew = (params) => {
  return request.get('/admin/stats-snapshot/account-success-ranking', { params })
}

export const getAccountFailRankingNew = (params) => {
  return request.get('/admin/stats-snapshot/account-fail-ranking', { params })
}

export const getSiteDistributionNew = (params) => {
  return request.get('/admin/stats-snapshot/site-distribution', { params })
}

export const getHourlyDistributionNew = (params) => {
  return request.get('/admin/stats-snapshot/hourly-distribution', { params })
}

export const getRemarkRequestRankingNew = (params) => {
  return request.get('/admin/stats-snapshot/remark-request-ranking', { params })
}

export const getRemarkCostRankingNew = (params) => {
  return request.get('/admin/stats-snapshot/remark-cost-ranking', { params })
}
