export function relativeTime(dateInput) {
  // Use native Date constructor — handles all ISO 8601 formats
  // including Supabase TIMESTAMPTZ with +05:30, +00:00, Z suffixes
  const date = new Date(dateInput)
  if (!dateInput || isNaN(date.getTime())) return "Unknown time"

  const now = new Date()
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return "Just now"
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`
  return date.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}
