import request from '@/utils/request'

// 获取统计概览
export const getStatsOverview = () => {
  return request.get('/admin/stats/overview')
}

// 获取账号成功排行
export const getAccountSuccessRanking = (params) => {
  return request.get('/admin/stats/account-success-ranking', { params })
}

// 获取账号失败排行
export const getAccountFailRanking = (params) => {
  return request.get('/admin/stats/account-fail-ranking', { params })
}

// 获取网站请求分布
export const getSiteDistribution = (params) => {
  return request.get('/admin/stats/site-distribution', { params })
}

// 获取每小时请求分布
export const getHourlyDistribution = (params) => {
  return request.get('/admin/stats/hourly-distribution', { params })
}

// 获取异常账号
export const getAbnormalAccounts = () => {
  return request.get('/admin/stats/abnormal-accounts')
}

// 获取低余额账号
export const getLowBalanceAccounts = (params) => {
  return request.get('/admin/stats/low-balance-accounts', { params })
}

// 获取即将过期账号
export const getExpiringAccounts = (params) => {
  return request.get('/admin/stats/expiring-accounts', { params })
}

// 清除统计缓存
export const clearStatsCache = () => {
  return request.delete('/admin/stats/cache')
}
