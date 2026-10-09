const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const pdfs = JSON.parse(process.argv[2])

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1240, height: 1754,
    webPreferences: { contextIsolation: true, nodeIntegration: false, offscreen: true, webSecurity: false }
  })
  const results = []
  let onMsg = null
  win.webContents.on('console-message', (...a) => {
    const rec = a[0]
    const msg = typeof rec === 'object' && rec && 'message' in rec ? rec.message : a[2]
    if (onMsg) onMsg(String(msg))
  })
  for (const pdf of pdfs) {
    const collected = []
    const done = new Promise((resolve) => { onMsg = (m) => { collected.push(m); if (m.startsWith('DONE')) resolve() } })
    await win.loadFile(path.join(__dirname, 'test.html'), { query: { pdf, mode: 'probe' } })
    const to = new Promise((r) => setTimeout(() => r('TIMEOUT'), 30000))
    await Promise.race([done, to])
    onMsg = null
    results.push({ pdf, msgs: collected.filter((m) => !m.startsWith('DONE')) })
  }
  console.log('RESULTS ' + JSON.stringify(results, null, 1))
  app.quit()
})
app.on('window-all-closed', () => app.quit())
