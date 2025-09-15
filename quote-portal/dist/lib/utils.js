// Shared utilities and constants (ES module)

export function uid() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  
  // Get current counter from localStorage or start from 1
  const counterKey = `bk_id_counter_${year}${month}`
  let counter = 1
  try {
    const stored = localStorage.getItem(counterKey)
    if (stored) {
      counter = parseInt(stored, 10) + 1
    }
  } catch {}
  
  // Store updated counter
  try {
    localStorage.setItem(counterKey, counter.toString())
  } catch {}
  
  const sequence = String(counter).padStart(5, '0')
  return `BK${year}${month}${sequence}`
}

export function downloadDataUrl(name, dataUrl) {
  try {
    const a = document.createElement('a')
    a.href = dataUrl; a.download = name || 'download'
    document.body.appendChild(a); a.click(); a.remove()
  } catch {}
}

// Allowed file types and size
export const ACCEPT_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'dxf', 'dwg', 'step', 'stp', 'iges', 'igs']
export const MAX_FILES = 2
export const MAX_FILE_MB = 1.5
export const MAX_PRODUCT_FILES = 5

export function extOf(name) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

export function isImageExt(extOrMime) {
  const e = (extOrMime || '').toLowerCase()
  return e.startsWith('image/') || ['png','jpg','jpeg'].includes(e)
}

