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

const OCR_MAX_SIDE = 2000

// Full-resolution phone photos make Tesseract take many seconds; text stays legible at
// this size. Falls back to the original image wherever canvas decoding is unavailable.
export async function downscaleForOcr(image: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return image

  try {
    const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
    const ratio = Math.min(1, OCR_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    if (ratio === 1) {
      bitmap.close()
      return image
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const context = canvas.getContext('2d')
    context?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    if (!context) return image

    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? image), 'image/jpeg', 0.9))
  } catch {
    return image
  }
}
