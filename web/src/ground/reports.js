// Pure helpers for the ground doctor screen. The server decides what arrived (GET /api/reports);
// these only work out countdowns and progress between two polls.

/** Seconds left until a report in transit arrives, counting down from the moment it was fetched. */
export function remainingSeconds(report, fetchedAtMs, nowMs) {
  const left = (report.secondsToDeliver ?? 0) - (nowMs - fetchedAtMs) / 1000
  return Math.max(0, left)
}

/** 0 to 1: how much of the signal's trip is done. */
export function progress(report, remaining) {
  const total = (Date.parse(report.deliverAt) - Date.parse(report.sentAt)) / 1000
  if (!(total > 0)) return 1
  return Math.min(1, Math.max(0, 1 - remaining / total))
}

export function splitReports(reports) {
  return {
    arrived: reports.filter(r => r.status === 'arrived'),
    inTransit: reports.filter(r => r.status === 'in_transit'),
  }
}

/** One way delay of a report, in seconds. */
export const oneWaySeconds = report => Math.max(0, (Date.parse(report.deliverAt) - Date.parse(report.sentAt)) / 1000)

/** 2026-11-13T21:20:00Z -> "21:20:00 UTC" */
export const clockTime = iso => (iso ? `${iso.slice(11, 19)} UTC` : '')
