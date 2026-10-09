import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync } from 'node:fs'

const path = process.argv[2]
const data = new Uint8Array(readFileSync(path))
const doc = await getDocument({ data, isEvalSupported: false }).promise
console.log('pages:', doc.numPages)
const page = await doc.getPage(1)
const tc = await page.getTextContent()
console.log('text items on p1:', tc.items.length)
console.log('first 40 chars:', tc.items.map(i=>i.str).join('').slice(0,40).replace(/\n/g,'\\n'))
// Inspect fonts referenced
const seen = new Set()
for (const it of tc.items) {
  if (it.fontName) seen.add(it.fontName)
}
console.log('fontName refs:', [...seen].join(', '))
// Try to pull font objects from commonObjs
await page.getOperatorList()
for (const name of seen) {
  try {
    const f = page.commonObjs.get(name)
    console.log('font', name, '=>', f && { name: f.name, missingFile: f.missingFile, loadedName: f.loadedName, isType3Font: f.isType3Font, type: f.type })
  } catch (e) { console.log('font', name, 'ERR', e.message) }
}
