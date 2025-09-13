// Shared utilities and constants (ES module)

export function uid() {
  return 'q_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
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

