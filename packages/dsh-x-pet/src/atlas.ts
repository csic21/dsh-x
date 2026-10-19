import { rowsForHeight, ATLAS_WIDTH } from './frames.ts'

/** A decoded atlas header: what the file claims about its own geometry. */
export interface AtlasInfo {
  mime: 'image/png' | 'image/webp'
  width: number
  height: number
  rows: 9 | 11
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngSize(bytes: Uint8Array): { width: number, height: number } | null {
  if (bytes.length < 24) return null
  if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return null
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function webpSize(bytes: Uint8Array): { width: number, height: number } | null {
  if (bytes.length < 30) return null
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF') return null
  if (String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') return null
  const chunk = String.fromCharCode(...bytes.subarray(12, 16))
  if (chunk === 'VP8X') {
    const width = 1 + (bytes[24] | bytes[25] << 8 | bytes[26] << 16)
    const height = 1 + (bytes[27] | bytes[28] << 8 | bytes[29] << 16)
    return { width, height }
  }
  if (chunk === 'VP8 ') {
    // A lossy bitstream: 3-byte frame tag, start code, then 14-bit dimensions.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
    const width = (bytes[26] | bytes[27] << 8) & 0x3fff
    const height = (bytes[28] | bytes[29] << 8) & 0x3fff
    return { width, height }
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) return null
    const bits = bytes[21] | bytes[22] << 8 | bytes[23] << 16 | bytes[24] << 24
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) }
  }
  return null
}

/**
 * Read an atlas header and apply the Codex geometry rules. A file that decodes
 * to something else is not a pet sheet and is refused by name, never silently
 * stretched.
 */
export function inspectAtlas(bytes: Uint8Array): AtlasInfo {
  const png = pngSize(bytes)
  const webp = png ? null : webpSize(bytes)
  const size = png ?? webp
  if (!size) throw new Error('PET_FORMAT')
  if (size.width !== ATLAS_WIDTH) throw new Error('PET_WIDTH')
  const rows = rowsForHeight(size.height)
  if (rows === null) throw new Error('PET_HEIGHT')
  return { mime: png ? 'image/png' : 'image/webp', width: size.width, height: size.height, rows }
}
