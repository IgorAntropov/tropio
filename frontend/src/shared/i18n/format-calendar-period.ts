type Translate = (key: string, values?: Record<string, string | number>) => string

export function formatCalendarPeriod(t: Translate, start: Date, end?: Date) {
  const dayMonth = (date: Date) => t('dateRange.dayMonth', {
    day: date.getUTCDate(),
    month: t('dateRange.shortMonths.' + date.getUTCMonth()),
  })
  const withYear = (date: Date) => t('dateRange.withYear', { date: dayMonth(date), year: date.getUTCFullYear() })
  if (!end || end <= start) return withYear(start)
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  if (sameYear && start.getUTCMonth() === end.getUTCMonth()) {
    return t('dateRange.withinMonth', { first: start.getUTCDate(), last: withYear(end) })
  }
  return t('dateRange.acrossMonths', { first: sameYear ? dayMonth(start) : withYear(start), last: withYear(end) })
}
