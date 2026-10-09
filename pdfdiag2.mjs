import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync } from 'node:fs'
const data = new Uint8Array(readFileSync(process.argv[2]))
const doc = await getDocument({ data, isEvalSupported: false }).promise
const page = await doc.getPage(1)
const tc = await page.getTextContent()
const names = [...new Set(tc.items.map(i=>i.fontName))]
await page.getOperatorList()
for (const n of names) {
  const f = page.commonObjs.get(n)
  console.log(n, {
    name: f.name, data: f.data ? f.data.length : null, missingFile: f.missingFile,
    systemFontInfo: f.systemFontInfo ?? null,
    fontMatrix: f.fontMatrix, vertical: f.vertical, isType3Font: f.isType3Font,
    bold: f.bold, black: f.black, loadedName: f.loadedName
  })
}
