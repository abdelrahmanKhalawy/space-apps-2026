// Run: node web/src/voice/speak.test.mjs
import { langOf } from './speak.js'

let failed = 0
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++ }
check('Arabic advice is read in Arabic', langOf('نومك قليل جدًا. بلّغ طبيب الأرض.') === 'ar-EG')
check('English advice is read in English', langOf('Rest 30 minutes and measure again.') === 'en-US')
check('mixed text with Arabic letters uses Arabic', langOf('Sleep: 4.9 h نومك قليل') === 'ar-EG')
console.log(failed === 0 ? 'all passed' : `${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
