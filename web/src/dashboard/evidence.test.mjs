// Run: node web/src/dashboard/evidence.test.mjs
// Every metric with color ranges must say how sure we are, for both the ranges and the space link.
import { readFileSync } from 'node:fs'
import { EVIDENCE, LEVELS } from './evidence.js'

const raw = JSON.parse(readFileSync(new URL('../../../research/thresholds.json', import.meta.url), 'utf8'))
const metrics = Object.keys(raw).filter(k => !k.startsWith('_'))
let bad = 0
for (const m of metrics) {
  for (const part of ['range', 'link']) {
    const e = EVIDENCE[m]?.[part]
    if (!e || !LEVELS[e.level] || !e.note) { console.error(`FAIL  ${m}.${part} missing or invalid`); bad++ }
  }
}
console.log(bad === 0 ? `PASS  all ${metrics.length} metrics have evidence levels` : `${bad} problems`)
process.exit(bad === 0 ? 0 : 1)
