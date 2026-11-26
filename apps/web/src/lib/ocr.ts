import { releaseCanvas, scaleToWhiteCanvas } from './canvas'
import { extractIsbn } from './isbn'

export type OcrSuggestion = {
  rawText: string
  isbn: string | null
  title: string | null
  authors: string[]
}

export async function recognizeBookText(image: Blob): Promise<OcrSuggestion> {
  const tesseract = await import('tesseract.js')
  const result = await tesseract.recognize(await downscaleForOcr(image), 'eng')
  const rawText = result.data.text.trim()
  const lines = rawText.split('\n').map(cleanLine).filter(Boolean)
  const byLine = lines.find((line) => /^by\s+/i.test(line))

  return {
    rawText,
    isbn: extractIsbn(rawText),
    title: findTitleCandidate(lines),
    authors: byLine ? [byLine.replace(/^by\s+/i, '').trim()] : []
  }
}

export function parseOcrSuggestion(rawText: string): OcrSuggestion {
  const trimmedText = rawText.trim()
  const lines = trimmedText.split('\n').map(cleanLine).filter(Boolean)
  const byLine = lines.find((line) => /^by\s+/i.test(line))

  return {
    rawText: trimmedText,
    isbn: extractIsbn(trimmedText),
    title: findTitleCandidate(lines),
    authors: byLine ? [byLine.replace(/^by\s+/i, '').trim()] : []
  }
}

function cleanLine(line: string): string {
  return line.replace(/[|~_`^]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function findTitleCandidate(lines: string[]): string | null {
  return lines.find((line) => {
    if (/^(isbn|by|author|publisher)\b/i.test(line)) return false
    const letters = [...line].filter((character) => /[a-z]/i.test(character)).length
    const words = line.split(/\s+/).filter(Boolean).length
    return words >= 2 && letters >= 8 && letters / Math.max(line.length, 1) > 0.6
  }) ?? null
}

const OCR_MAX_SIDE = 3000

// Very large photos make Tesseract take many seconds. Only images above this size are
// shrunk, and only to it, so small back-cover print stays legible. Falls back to the
// original image wherever canvas decoding is unavailable.
export async function downscaleForOcr(image: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return image

  try {
    const bitmap = await decodeUpright(image)
    if (Math.max(bitmap.width, bitmap.height) <= OCR_MAX_SIDE) {
      bitmap.close()
      return image
    }

    // JPEG has no alpha, so the shared helper's white fill keeps transparent areas white.
    const canvas = scaleToWhiteCanvas(bitmap, { x: 0, y: 0, width: bitmap.width, height: bitmap.height }, OCR_MAX_SIDE)
    bitmap.close()
    if (!canvas) return image

    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result ?? image), 'image/jpeg', 0.9))
    releaseCanvas(canvas)
    return blob
  } catch {
    return image
  }
}

// Applies EXIF orientation explicitly where supported; engines that reject the
// 'from-image' value still get downscaled using their default orientation handling.
async function decodeUpright(image: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(image, { imageOrientation: 'from-image' })
  } catch {
    return await createImageBitmap(image)
  }
}
