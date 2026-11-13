// Run: node web/src/checks/logic.test.mjs
import { compareToSelf, persistentFlag, summarizeReaction } from './logic.js'

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
  if (!ok) failed++
}
const run = (median, lapses = 0) => ({ median, lapses })

const s = summarizeReaction([250, 260, 240, 700, 255], 1)
check('summary: median, lapses, false starts', s.median === 255 && s.lapses === 1 && s.falseStarts === 1, JSON.stringify(s))
check('summary of nothing is null', summarizeReaction([]) === null)

check('needs baseline runs first', compareToSelf([run(250), run(255)], 'reaction').ready === false)
const base = [run(250), run(260), run(255)]
check('same as usual: not flagged', compareToSelf([...base, run(258)], 'reaction').flagged === false)
check('clearly slower: flagged', compareToSelf([...base, run(340)], 'reaction').flagged === true)
check('more lapses: flagged', compareToSelf([...base, run(260, 3)], 'reaction').flagged === true)
check('one slow run alone is not a persistent flag', persistentFlag([...base, run(258), run(345)], 'reaction').flagged === false)
check('first slow run after the baseline is pending, not flagged', (() => { const r = persistentFlag([...base, run(340)], 'reaction'); return r.flagged === false && r.pending === true })())
check('two slow runs in a row are', persistentFlag([...base, run(340), run(350)], 'reaction').flagged === true)

const v = n => ({ line: n })
check('vision: one line worse than own baseline is flagged', compareToSelf([v(5), v(5), v(6), v(4)], 'vision').flagged === true)
check('vision: same line is fine', compareToSelf([v(5), v(5), v(6), v(5)], 'vision').flagged === false)

console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
