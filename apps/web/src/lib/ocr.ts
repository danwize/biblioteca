import { extractIsbn } from './isbn'

export type OcrSuggestion = {
  rawText: string
  isbn: string | null
  title: string | null
  authors: string[]
  series: string | null
}

export async function recognizeBookText(image: Blob): Promise<OcrSuggestion> {
  const tesseract = await import('tesseract.js')
  const result = await tesseract.recognize(image, 'eng')
  const rawText = result.data.text.trim()
  const lines = rawText.split('\n').map((line) => line.trim()).filter(Boolean)
  const byLine = lines.find((line) => /^by\s+/i.test(line))
  const seriesLine = lines.find((line) => /^series\s*:/i.test(line))

  return {
    rawText,
    isbn: extractIsbn(rawText),
    title: lines[0] ?? null,
    authors: byLine ? [byLine.replace(/^by\s+/i, '').trim()] : [],
    series: seriesLine ? seriesLine.replace(/^series\s*:/i, '').trim() : null
  }
}
