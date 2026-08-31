/**
 * WAT (Africa/Lagos) date formatting — single source per AUDIT-UI-002 / E1
 * Never use browser-local time. Always timeZone: "Africa/Lagos"
 */

export function formatWAT(date, opts = {}) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", ...opts }).format(d);
}

export function formatWATDate(date, opts = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) {
  return formatWAT(date, opts);
}

export function formatWATTime(date, opts = { hour: "2-digit", minute: "2-digit" }) {
  return formatWAT(date, opts);
}

export function formatWATDateTime(date, opts = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) {
  return formatWAT(date, opts);
}
