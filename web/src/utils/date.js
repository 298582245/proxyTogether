const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
const timezonePattern = /([zZ]|[+-]\d{2}:\d{2})$/

const isValidDate = (date) => date instanceof Date && !Number.isNaN(date.getTime())

export const parseLocalDateTime = (value) => {
  if (!value) return null

  if (value instanceof Date) {
    return isValidDate(value) ? new Date(value.getTime()) : null
  }

  if (typeof value === 'number') {
    const date = new Date(value)
    return isValidDate(date) ? date : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return null
  }

  if (timezonePattern.test(normalizedValue)) {
    const date = new Date(normalizedValue)
    return isValidDate(date) ? date : null
  }

  const dateMatch = normalizedValue.match(localDateTimePattern)
  if (dateMatch) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = dateMatch
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )

    return isValidDate(date) ? date : null
  }

  const fallbackDate = new Date(normalizedValue)
  return isValidDate(fallbackDate) ? fallbackDate : null
}

export const formatLocalizedDateTime = (value, locale = 'zh-CN') => {
  const date = parseLocalDateTime(value)
  if (!date) return ''

  return date.toLocaleString(locale, {
    hour12: false
  })
}

export const formatDateTimeForApi = (value) => {
  const date = parseLocalDateTime(value)
  if (!date) return null

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}
