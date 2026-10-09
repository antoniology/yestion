import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { readFileSync, writeFileSync } from 'node:fs'

class F {
  create(w,h){ const c=createCanvas(w,h); return { canvas:c, context:c.getContext('2d') } }
  reset(cc,w,h){ cc.canvas.width=w; cc.canvas.height=h }
  destroy(cc){ cc.canvas.width=0; cc.canvas.height=0 }
}
const data = new Uint8Array(readFileSync(process.argv[2]))
const doc = await getDocument({ data, isEvalSupported:false, CanvasFactory:F }).promise
const page = await doc.getPage(1)
const vp = page.getViewport({ scale: 2 })
const c = createCanvas(vp.width, vp.height)
const ctx = c.getContext('2d')
await page.render({ canvasContext: ctx, viewport: vp }).promise
writeFileSync('/tmp/pdfpage1.png', c.toBuffer('image/png'))
console.log('wrote /tmp/pdfpage1.png', vp.width, vp.height)
