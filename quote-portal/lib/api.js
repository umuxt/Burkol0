// API and localStorage fallback (ES module)
import { tFor, statusLabel } from '../i18n/index.js'

const LS_KEY = 'bk_quotes_v1'
function lsLoad() {
  try { const raw = localStorage.getItem(LS_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : [] } catch { return [] }
}
function lsSave(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)) }
function lsAdd(q) { const arr = lsLoad(); arr.unshift(q); lsSave(arr) }
function lsUpdate(id, patch) { const arr = lsLoad().map(x => x.id === id ? { ...x, ...patch } : x); lsSave(arr) }
function lsDelete(id) { const arr = lsLoad().filter(x => x.id !== id); lsSave(arr) }

export async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  return await Promise.race([
    fetch(url, options),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
  ])
}

export const API_BASE = (window.BURKOL_API || 'http://api.test-burkolmetal.com')

function getToken() { try { return localStorage.getItem('bk_admin_token') || '' } catch { return '' } }
function setToken(t) { try { if (t) localStorage.setItem('bk_admin_token', t); else localStorage.removeItem('bk_admin_token') } catch {} }

function withAuth(headers = {}) {
  const token = getToken()
  if (token) return { ...headers, Authorization: `Bearer ${token}` }
  return headers
}

export const API = {
  async listQuotes() {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes`, { headers: withAuth() })
      if (res.status === 401) throw new Error('unauthorized')
      if (!res.ok) throw new Error('list failed')
      return await res.json()
    } catch (e) {
      // If unauthorized, bubble up to show login
      if ((e && e.message && /401|unauthorized/i.test(e.message))) throw e
      return lsLoad()
    }
  },
  async addUser(email, password, role = 'admin') {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/users`, {
      method: 'POST',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, password, role })
    })
    if (!res.ok) throw new Error('add_user_failed')
    return await res.json()
  },
  async listUsers() {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/users`, { headers: withAuth() })
    if (!res.ok) throw new Error('list_users_failed')
    return await res.json()
  },
  async deleteUser(email) {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/users/${encodeURIComponent(email)}`, { method: 'DELETE', headers: withAuth() })
    if (!res.ok) throw new Error('delete_user_failed')
    return await res.json()
  },
  async createQuote(payload) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('create failed')
      return await res.json()
    } catch (e) {
      lsAdd(payload)
      return { ok: true, id: payload.id, local: true }
    }
  },
  async updateStatus(id, status) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}`, { method: 'PATCH', headers: withAuth({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status }) })
      if (!res.ok) throw new Error('update failed')
      return await res.json()
    } catch (e) {
      lsUpdate(id, { status })
      return { ok: true, local: true }
    }
  },
  async updateQuote(id, patch) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}`, { method: 'PATCH', headers: withAuth({ 'Content-Type': 'application/json' }), body: JSON.stringify(patch) })
      if (!res.ok) throw new Error('update failed')
      return await res.json()
    } catch (e) {
      lsUpdate(id, patch)
      return { ok: true, local: true }
    }
  },
  async remove(id) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}`, { method: 'DELETE', headers: withAuth() })
      if (!res.ok) throw new Error('delete failed')
      return await res.json()
    } catch (e) {
      lsDelete(id)
      return { ok: true, local: true }
    }
  },
  downloadTxt(id, data) {
    const url = `${API_BASE}/api/quotes/${id}/txt`
    fetchWithTimeout(url, { headers: withAuth() }, 2500).then((res) => {
      if (res && res.ok) {
        const a = document.createElement('a')
        a.href = url
        a.download = `burkol_quote_${id}.txt`
        document.body.appendChild(a); a.click(); a.remove()
      } else if (res && res.status === 401) {
        throw new Error('unauthorized')
      } else { throw new Error('backend txt not ok') }
    }).catch(() => {
      const q = data || lsLoad().find(x => x.id === id)
      if (!q) return
      const lines = []
      lines.push('Burkol Metal — Teklif Özeti')
      lines.push(`Tarih: ${new Date(q.createdAt || Date.now()).toLocaleString()}`)
      lines.push(`ID: ${q.id}`)
      lines.push('')
      lines.push('[Genel]')
      try {
        const lang = (localStorage.getItem('bk_lang') || 'tr')
        const t = tFor(lang)
        lines.push(`Durum: ${statusLabel(q.status, t)}`)
      } catch {
        lines.push(`Durum: ${q.status || ''}`)
      }
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
      const files = q.files || []
      lines.push('[Dosyalar]')
      if (files.length === 0) {
        lines.push('—')
      } else {
        files.forEach((f, i) => { lines.push(`${i + 1}. ${f.name} (${Math.round((f.size || 0) / 1024)} KB)`) })
      }
      lines.push('')
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const a = document.createElement('a'); const dl = URL.createObjectURL(blob)
      a.href = dl; a.download = `burkol_quote_${id}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(dl)
    })
  },
  // Auth
  async login(email, password, remember) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, remember }) })
      const data = await res.json() // Always parse JSON body
      if (!res.ok) {
        // Throw an error with the message from the server's JSON response
        throw new Error(data.error || (res.status === 401 ? 'unauthorized' : 'server_error'))
      }
      if (data && data.token) setToken(data.token)
      return data
    } catch (e) {
      if (e && e.message) throw e
      throw new Error('network_error')
    }
  },
  async me() {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/me`, { headers: withAuth() })
    if (!res.ok) throw new Error('unauthorized')
    return await res.json()
  },
  async logout() {
    try { await fetchWithTimeout(`${API_BASE}/api/auth/logout`, { method: 'POST', headers: withAuth() }) } catch {}
    setToken('')
  }
}

export default API
