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
