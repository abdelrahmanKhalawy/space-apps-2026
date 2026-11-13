// Offline outbox: a reading logged with no connection is kept on this device and sent when the
// connection comes back. The real mission problem is a link that comes and goes, so logging
// should never fail just because the signal did.
//
// Only a network failure queues a batch. If the server answers and says the readings are invalid,
// the batch is dropped (retrying a bad request forever helps nobody).
// storage and fetchFn are injectable so outbox.test.mjs can run without a browser.

const KEY = 'astropulse.outbox.v1'
export const CHANGED = 'astropulse-outbox'

function read(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function write(storage, batches) {
  try {
    storage.setItem(KEY, JSON.stringify(batches))
  } catch {
    /* storage unavailable: nothing more we can do */
  }
}

export const pendingCount = (storage = globalThis.localStorage) =>
  read(storage).reduce((n, b) => n + b.length, 0)

export function queueReadings(readings, storage = globalThis.localStorage) {
  const batches = read(storage)
  batches.push(readings)
  write(storage, batches)
  globalThis.dispatchEvent?.(new Event(CHANGED)) // lets the banner update at once
  return batches.reduce((n, b) => n + b.length, 0)
}

/** Tries to send everything waiting. Stops at the first network failure. */
export async function flushOutbox(storage = globalThis.localStorage, fetchFn = globalThis.fetch.bind(globalThis)) {
  let batches = read(storage)
  let sent = 0
  let dropped = 0
  while (batches.length > 0) {
    let res
    try {
      res = await fetchFn('/api/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batches[0]),
      })
    } catch {
      break // still offline
    }
    if (res.ok) sent += batches[0].length
    else if (res.status >= 500) break // server trouble: keep it and try later
    else dropped += batches[0].length // the server rejected it for good
    batches = batches.slice(1)
    write(storage, batches)
  }
  return { sent, dropped, remaining: batches.reduce((n, b) => n + b.length, 0) }
}
