// Renders the web-app PNGs (icons, social card) from the SVGs in this folder.
//   cd docs/brand && npm i sharp && node export-png.mjs ../../web/public
import sharp from 'sharp'
const out = process.argv[2]
const jobs = [
  ['app-icon.svg', 'icon-512.png', 512],
  ['app-icon.svg', 'icon-192.png', 192],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['icon-square.svg', 'apple-touch-icon.png', 180],
  ['app-icon.svg', 'favicon-48.png', 48],
  ['og.svg', 'og.png', 1200],
]
for (const [src, name, size] of jobs) {
  await sharp(src, { density: 300 }).resize(size).png({ compressionLevel: 9 }).toFile(`${out}/${name}`)
  console.log('wrote', name)
}
