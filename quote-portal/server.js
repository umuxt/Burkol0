// Minimal Express backend for Burkol Quote Portal
// - Stores quotes in a JSON file
// - Generates simple PDF per quote

const express = require('express')
const path = require('path')
const PDFDocument = require('pdfkit')

const app = express()
const PORT = process.env.PORT || 3001
const ROOT = __dirname
// In-memory storage (no JSON file persistence)
let QUOTES = []

app.use(express.json({ limit: '5mb' }))
// Simple CORS for local dev (e.g., 127.0.0.1:5500)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})
// Optional: serve static for direct access; harmless if unused
app.use(express.static(ROOT))

function readAll() { return QUOTES }
function writeAll(arr) { QUOTES = arr }

// List quotes
app.get('/api/quotes', (req, res) => {
  return res.json(readAll())
})

// Create quote
app.post('/api/quotes', (req, res) => {
  const q = req.body || {}
  if (!q || !q.id) return res.status(400).json({ error: 'invalid payload' })
  const list = readAll()
  list.unshift(q)
  writeAll(list)
  return res.json({ ok: true, id: q.id })
})

// Update status
app.patch('/api/quotes/:id', (req, res) => {
  const { id } = req.params
  const { status } = req.body || {}
  const list = readAll()
  const ix = list.findIndex((x) => x.id === id)
  if (ix === -1) return res.status(404).json({ error: 'not found' })
  list[ix].status = status || list[ix].status
  writeAll(list)
  return res.json({ ok: true })
})

// Delete
app.delete('/api/quotes/:id', (req, res) => {
  const { id } = req.params
  const list = readAll().filter((x) => x.id !== id)
  writeAll(list)
  return res.json({ ok: true })
})

// Simple PDF generation
app.get('/api/quotes/:id/pdf', (req, res) => {
  const { id } = req.params
  const list = readAll()
  const q = list.find((x) => x.id === id)
  if (!q) return res.status(404).send('Not found')

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="burkol_quote_${id}.pdf"`)

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  doc.pipe(res)

  doc.fontSize(18).text('Burkol Metal — Teklif Özeti', { align: 'left' })
  doc.moveDown(0.5)
  doc.fontSize(10).fillColor('#666').text(new Date(q.createdAt || Date.now()).toLocaleString())
  doc.moveDown()

  const sections = [
    ['Genel', [
      ['Durum', q.status],
      ['Proje', q.proj],
      ['Süreç', (q.process || []).join(', ')],
      ['Açıklama', q.desc]
    ]],
    ['Müşteri', [
      ['Ad Soyad', q.name],
      ['Firma', q.company],
      ['E‑posta', q.email],
      ['Telefon', q.phone],
      ['Ülke/Şehir', `${q.country || ''} / ${q.city || ''}`]
    ]],
    ['Teknik', [
      ['Malzeme', q.material],
      ['Kalite/Alaşım', q.grade],
      ['Kalınlık', `${q.thickness} mm`],
      ['Adet', `${q.qty}`],
      ['Boyut', q.dims],
      ['Tolerans', q.tolerance],
      ['Yüzey', q.finish],
      ['Termin', q.due],
      ['Tekrarlılık', q.repeat],
      ['Bütçe', q.budget]
    ]]
  ]

  sections.forEach(([title, rows]) => {
    doc.fillColor('#000').fontSize(12).text(title, { underline: true })
    doc.moveDown(0.3)
    rows.forEach(([k, v]) => {
      doc.fontSize(10).fillColor('#111').text(`${k}: `, { continued: true })
      doc.fillColor('#333').text(String(v || '—'))
    })
    doc.moveDown(0.6)
  })

  const files = q.files || []
  if (files.length) {
    doc.fillColor('#000').fontSize(12).text('Dosyalar', { underline: true })
    doc.moveDown(0.3)
    files.forEach((f) => {
      doc.fontSize(10).fillColor('#333').text(`${f.name} (${Math.round((f.size||0)/1024)} KB)`) 
    })
  }

  doc.end()
})

// Plain text export
app.get('/api/quotes/:id/txt', (req, res) => {
  const { id } = req.params
  const list = readAll()
  const q = list.find((x) => x.id === id)
  if (!q) return res.status(404).send('Not found')

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="burkol_quote_${id}.txt"`)

  const lines = []
  lines.push('Burkol Metal — Teklif Özeti')
  lines.push(`Tarih: ${new Date(q.createdAt || Date.now()).toLocaleString()}`)
  lines.push(`ID: ${q.id}`)
  lines.push('')
  lines.push('[Genel]')
  lines.push(`Durum: ${q.status || ''}`)
  lines.push(`Proje: ${q.proj || ''}`)
  lines.push(`Süreç: ${(q.process || []).join(', ')}`)
  lines.push(`Açıklama: ${q.desc || ''}`)
  lines.push('')
  lines.push('[Müşteri]')
  lines.push(`Ad Soyad: ${q.name || ''}`)
  lines.push(`Firma: ${q.company || ''}`)
  lines.push(`E‑posta: ${q.email || ''}`)
  lines.push(`Telefon: ${q.phone || ''}`)
  lines.push(`Ülke/Şehir: ${(q.country || '')} / ${(q.city || '')}`)
  lines.push('')
  lines.push('[Teknik]')
  lines.push(`Malzeme: ${q.material || ''}`)
  lines.push(`Kalite/Alaşım: ${q.grade || ''}`)
  lines.push(`Kalınlık: ${q.thickness || ''} mm`)
  lines.push(`Adet: ${q.qty || ''}`)
  lines.push(`Boyut: ${q.dims || ''}`)
  lines.push(`Tolerans: ${q.tolerance || ''}`)
  lines.push(`Yüzey: ${q.finish || ''}`)
  lines.push(`Termin: ${q.due || ''}`)
  lines.push(`Tekrarlılık: ${q.repeat || ''}`)
  lines.push(`Bütçe: ${q.budget || ''}`)
  lines.push('')
  const files = q.files || []
  lines.push('[Dosyalar]')
  if (files.length === 0) {
    lines.push('—')
  } else {
    files.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.name} (${Math.round((f.size || 0) / 1024)} KB)`) 
    })
  }
  lines.push('')

  res.send(lines.join('\n'))
})

// SPA fallback
app.get(['/', '/index.html', '/#/teklif', '/#/admin'], (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'))
})

app.listen(PORT, () => console.log(`Burkol Quote server on http://localhost:${PORT}`))
