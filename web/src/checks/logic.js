// Two quick self-checks that need no hardware: a reaction test (tiredness shows up as slower, patchier
// reactions, the idea behind the PVT-B test used in sleep research) and a near-vision check (NASA follows
// vision changes on long missions: SANS). Neither has a "normal range" we can honestly cite for a phone
// screen, so they are only ever compared with YOUR OWN earlier results. That is the whole point of
// AstroPulse: your normal, not a population's.

export const LAPSE_MS = 500 // a reaction slower than this counts as a lapse of attention
export const BASELINE_RUNS = 3 // the first few runs set your normal

const median = xs => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = xs => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map(x => (x - m) * (x - m))))
}

/** trials: reaction times in ms (false starts are counted separately). */
export function summarizeReaction(trials, falseStarts = 0) {
  if (trials.length === 0) return null
  return {
    median: Math.round(median(trials)),
    lapses: trials.filter(t => t > LAPSE_MS).length,
    falseStarts,
    n: trials.length,
  }
}

/** history: oldest first. Returns where this person stands against their OWN first runs. */
export function compareToSelf(history, kind) {
  if (history.length < BASELINE_RUNS + 1) {
    return { ready: false, runsNeeded: BASELINE_RUNS + 1 - history.length }
  }
  const base = history.slice(0, BASELINE_RUNS)
  const latest = history[history.length - 1]
  if (kind === 'reaction') {
    const vals = base.map(h => h.median)
    const limit = mean(vals) + Math.max(2 * sd(vals), 40)
    const slower = latest.median > limit
    const moreLapses = latest.lapses >= mean(base.map(h => h.lapses)) + 2
    return { ready: true, flagged: slower || moreLapses, baseline: Math.round(mean(vals)), latest: latest.median, why: slower ? 'slower' : moreLapses ? 'lapses' : null }
  }
  // vision: line 1 is the biggest print, higher is smaller print you could still read
  const base_ = mean(base.map(h => h.line))
  const dropped = base_ - latest.line >= 1
  return { ready: true, flagged: dropped, baseline: +base_.toFixed(1), latest: latest.line, why: dropped ? 'worse' : null }
}

/** One result is noisy: a flag only stands if the last two runs both agree. */
export function persistentFlag(history, kind) {
  const now = compareToSelf(history, kind)
  // The first run after the baseline can only be "worth checking again", never an alert.
  if (history.length < BASELINE_RUNS + 2) return { ...now, flagged: false, pending: Boolean(now.flagged) }
  const before = compareToSelf(history.slice(0, -1), kind)
  return { ...now, flagged: now.flagged && before.flagged }
}
