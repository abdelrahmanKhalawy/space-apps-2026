// Run: node web/src/privacy/consent.test.mjs
import { ALL_ON, buildReportWithConsent, isShared, loadConsent } from './consent.js'

let failed = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); if (!ok) failed++ }
const mem = (init) => ({ getItem: () => init ?? null, setItem() {} })
const common = { crewId: 'crew-1', mission: 'mars', namer: m => m, formatValueFn: (m, v) => String(v) }
const reds = [{ metric: 'sleep_hours', value: 4.9 }, { metric: 'heart_rate', value: 130 }]

check('default: everything shared', Object.values(loadConsent(mem())).every(Boolean))
check('bad stored value falls back to everything shared', Object.values(loadConsent(mem('{oops'))).every(Boolean))
check('a stored "off" is respected', loadConsent(mem('{"behavior":false}')).behavior === false)
check('metric groups', isShared('heart_rate', ALL_ON) && !isShared('mood', { ...ALL_ON, behavior: false }))

const all = buildReportWithConsent({ ...common, consent: ALL_ON, reds })
check('all shared: normal report, both metrics', all.metrics.length === 2 && !all.summary.includes('withheld'))
const some = buildReportWithConsent({ ...common, consent: { ...ALL_ON, behavior: false }, reds })
check('sleep withheld: heart rate still sent, note added', some.metrics.join() === 'heart_rate' && some.summary.includes('withheld') && !some.summary.includes('sleep'), some.summary)
const none = buildReportWithConsent({ ...common, consent: { vitals: false, blood: false, behavior: false }, reds })
check('everything withheld: still a RED report, no details', none.severity === 'red' && none.metrics.length === 0 && none.summary.includes('red alert'), none.summary)

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
