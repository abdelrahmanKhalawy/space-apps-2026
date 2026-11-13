import { METRIC_ORDER } from '../dashboard/metricInfo.js'
import { worstColor } from '../dashboard/status.js'

// Which indicators belong to which part of the body. Every metric in contracts/reading.md appears exactly once.
// Blood sugar has no organ in the brief, so it sits under "Metabolism" (the pancreas) rather than being hidden.
export const ORGANS = [
  { id: 'brain', label: 'Brain', metrics: ['sleep_hours', 'mood'] },
  { id: 'lungs', label: 'Lungs', metrics: ['spo2'] },
  { id: 'heart', label: 'Heart', metrics: ['heart_rate', 'bp_systolic', 'bp_diastolic'] },
  { id: 'metabolism', label: 'Metabolism', metrics: ['glucose'] },
  { id: 'skin', label: 'Skin', metrics: ['temperature'] },
]

export const organOf = metric => ORGANS.find(o => o.metrics.includes(metric))?.id ?? null

/** Status of one organ: the worst color of its indicators that have a reading. color is null when none do. */
export function organStatus(status, organ) {
  const items = organ.metrics
    .map(metric => status.metrics.find(m => m.metric === metric))
    .filter(Boolean)
    .sort((a, b) => METRIC_ORDER.indexOf(a.metric) - METRIC_ORDER.indexOf(b.metric))
  return { id: organ.id, label: organ.label, color: worstColor(items.map(i => i.color)), items }
}

export const allOrganStatuses = status => ORGANS.map(o => organStatus(status, o))

/**
 * Which organs just got a new reading, by comparing two /api/status answers.
 * A reading counts as new when its time or value changed, or when the indicator showed up for the first time.
 */
export function changedOrgans(previous, next) {
  if (!previous) return []
  const before = Object.fromEntries(previous.metrics.map(m => [m.metric, m]))
  const hit = new Set()
  for (const m of next.metrics) {
    const old = before[m.metric]
    if (!old || old.takenAt !== m.takenAt || old.value !== m.value) {
      const id = organOf(m.metric)
      if (id) hit.add(id)
    }
  }
  return [...hit]
}
