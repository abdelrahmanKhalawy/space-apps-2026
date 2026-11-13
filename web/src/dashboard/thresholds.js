import raw from '../../../research/thresholds.json'

// Same file the server reads. Keys that start with "_" are notes, and the server ignores them too.
// Used here to draw the colored bands behind the charts and for the offline fallback.
const thresholds = Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith('_')))

export default thresholds
