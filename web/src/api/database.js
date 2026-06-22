import request from '@/utils/request'

const LONG_TIMEOUT = 5 * 60 * 1000

export const getBackupConfig = () => {
  return request.get('/admin/database/backup/config')
}

export const updateBackupConfig = (configs) => {
  return request.put('/admin/database/backup/config', { configs })
}

export const runBackup = () => {
  return request.post('/admin/database/backups/run', {}, { timeout: LONG_TIMEOUT })
}

export const exportDatabase = () => {
  return request.post('/admin/database/export', {}, { timeout: LONG_TIMEOUT })
}

export const listBackups = () => {
  return request.get('/admin/database/backups')
}

export const downloadBackup = async (fileName) => {
  const response = await request.get(`/admin/database/backups/${encodeURIComponent(fileName)}/download`, {
    responseType: 'blob',
    timeout: LONG_TIMEOUT,
  })
  const blob = response instanceof Blob ? response : response.data
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export const deleteBackup = (fileName) => {
  return request.delete(`/admin/database/backups/${encodeURIComponent(fileName)}`)
}

export const importDatabase = (formData) => {
  return request.post('/admin/database/import', formData, {
    timeout: LONG_TIMEOUT,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

export const getOperationStatus = () => {
  return request.get('/admin/database/operation/status')
}
