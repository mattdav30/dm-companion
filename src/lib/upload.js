import { api } from './api.js'
import { getCampaignId } from './data.js'

/* Resize an image file in the browser. square=true crops to a centred square. */
export async function resizeImage(file, max = 1600, square = false) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('That file is not an image the browser can read'))
      i.src = url
    })
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
    if (square) {
      const s = Math.min(sw, sh)
      sx = (sw - s) / 2
      sy = Math.max(0, (sh - s) / 3)
      sw = sh = s
    }
    const scale = Math.min(1, max / Math.max(sw, sh))
    const c = document.createElement('canvas')
    c.width = Math.round(sw * scale)
    c.height = Math.round(sh * scale)
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
    return await new Promise((res) => c.toBlob(res, 'image/webp', 0.86))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/* Upload into the campaign's file store. Returns a URL that changes whenever the file does. */
export async function uploadArt(relPath, blob) {
  const res = await api.put(`/c/${getCampaignId()}/files/${relPath}`, blob, blob.type || 'image/webp')
  return res.url
}

export function pickFile(accept = 'image/*') {
  return new Promise((res) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => res(input.files?.[0] || null)
    input.click()
  })
}
