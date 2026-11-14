// Runs the camera-pulse algorithm on the BIDMC PPG dataset (53 real recordings) and writes the accuracy numbers.
//
//   node web/scripts/validate-bidmc.mjs --download --out data/validation/bidmc.json
//   node web/scripts/validate-bidmc.mjs --dir path/to/bidmc_csv --out data/validation/bidmc.json
//
// --download fetches the CSV files from PhysioNet (needs a network that can reach physionet.org; the GitHub workflow
// "Validate pulse algorithm" does exactly this). --dir reads files you already have: bidmc_NN_Signals.csv and bidmc_NN_Numerics.csv.
// Dataset: Pimentel et al., IEEE TBME 2016; PhysioNet, Open Data Commons Attribution License v1.0.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { evaluateRecord, summarize, WINDOW_S, STEP_S } from '../src/live/validate.js'

const args = process.argv.slice(2)
const flag = name => args.includes(name)
const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null)

const BASE = 'https://physionet.org/files/bidmc/1.0.0/bidmc_csv'
const out = value('--out') ?? 'data/validation/bidmc.json'
const dir = value('--dir')
const limit = Number(value('--limit') ?? 53)
const ids = Array.from({ length: limit }, (_, i) => String(i + 1).padStart(2, '0'))

async function getText(id, kind) {
  const name = `bidmc_${id}_${kind}.csv`
  if (dir) return readFile(join(dir, name), 'utf8')
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${BASE}/${name}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) {
      if (attempt === 4) throw new Error(`${name}: ${e.message}`)
      await new Promise(r => setTimeout(r, 1500 * attempt))
    }
  }
}

if (!dir && !flag('--download')) {
  console.error('Pass --download (fetch from PhysioNet) or --dir <folder with the CSV files>.')
  process.exit(2)
}

const windows = []
const failed = []
// a few at a time, so a slow connection doesn't take forever and the memory stays small
for (let i = 0; i < ids.length; i += 4) {
  await Promise.all(ids.slice(i, i + 4).map(async id => {
    try {
      const [signals, numerics] = await Promise.all([getText(id, 'Signals'), getText(id, 'Numerics')])
      windows.push(...evaluateRecord(signals, numerics, id))
      console.log(`record ${id}: ok`)
    } catch (e) {
      failed.push(`${id}: ${e.message}`)
      console.error(`record ${id}: ${e.message}`)
    }
  }))
}

const result = {
  dataset: 'BIDMC PPG and Respiration Dataset v1.0.0 (PhysioNet), Open Data Commons Attribution License v1.0',
  citation: 'Pimentel MAF et al., Towards a robust estimation of respiratory rate from pulse oximeters, IEEE Trans Biomed Eng 64(8):1914-1923, 2017.',
  method: `Sliding ${WINDOW_S}-second windows every ${STEP_S} seconds. The algorithm (web/src/live/ppg.js, the same one the phone-camera feature uses) estimates heart rate from the finger PPG; the reference is the mean ECG-derived heart rate over the same window. Only windows the app would accept (quality "good") count towards the error.`,
  limits: 'Pulse-oximeter PPG from hospital patients, not phone-camera video. It validates the signal processing on real pulse waveforms and noise, not the camera, its optics or motion on a real phone.',
  generated: new Date().toISOString().slice(0, 10),
  failed_records: failed,
  summary: summarize(windows),
}
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result.summary, null, 2))
if (windows.length === 0) process.exit(1)
