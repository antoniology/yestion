const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const resources = path.join(root, 'resources')
const svg = path.join(resources, 'icon.svg')
const tmp = path.join(resources, '.icon-tmp')
const iconset = path.join(resources, 'icon.iconset')

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

fs.rmSync(tmp, { recursive: true, force: true })
fs.rmSync(iconset, { recursive: true, force: true })
fs.mkdirSync(tmp, { recursive: true })
fs.mkdirSync(iconset, { recursive: true })

const basePng = path.join(tmp, 'base.png')

try {
  // Primary: QuickLook thumbnail generator renders SVG at exact size.
  run(`qlmanage -t -s 1024 -o "${tmp}" "${svg}" >/dev/null 2>&1`)
  const thumb = path.join(tmp, 'icon.svg.png')
  if (fs.existsSync(thumb)) {
    fs.copyFileSync(thumb, basePng)
  } else {
    throw new Error('qlmanage produced no thumbnail')
  }
} catch {
  // Fallback: sips can also rasterize SVG on modern macOS.
  run(`sips -s format png "${svg}" --out "${basePng}" >/dev/null 2>&1`)
}

const sizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 }
]

for (const { name, size } of sizes) {
  run(`sips -z ${size} ${size} "${basePng}" --out "${path.join(iconset, name)}" >/dev/null 2>&1`)
}

run(`iconutil -c icns "${iconset}" -o "${path.join(resources, 'icon.icns')}"`)
run(`sips -z 512 512 "${basePng}" --out "${path.join(resources, 'icon.png')}" >/dev/null 2>&1`)

fs.rmSync(tmp, { recursive: true, force: true })
fs.rmSync(iconset, { recursive: true, force: true })

console.log('Generated resources/icon.icns and resources/icon.png')
