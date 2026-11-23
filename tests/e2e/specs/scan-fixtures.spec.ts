import { expect, test } from '@playwright/test'

const BARCODE_FIXTURE_URL = '/src/lib/fixtures/isbn-9780486214375.png'
const OCR_FIXTURE_URL = '/src/lib/fixtures/book-cover-ocr.png'

test.describe('real-image scan fixtures', () => {
  test.skip(
    Boolean(process.env.BIBLIOTECA_BASE_URL),
    'Fixture decoding imports source modules from the Vite dev server'
  )

  test('decodes the ISBN barcode fixture through ZXing', async ({ page }) => {
    await page.goto('/')

    const isbn = await page.evaluate(async (fixtureUrl) => {
      delete (window as { BarcodeDetector?: unknown }).BarcodeDetector
      const response = await fetch(fixtureUrl)
      const blob = await response.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      const barcodeModule = '/src/lib/barcode.ts'
      const { detectIsbn } = await import(/* @vite-ignore */ barcodeModule)
      return await detectIsbn(dataUrl)
    }, BARCODE_FIXTURE_URL)

    expect(isbn).toBe('9780486214375')
  })

  test('extracts cover metadata from the OCR fixture after preprocessing', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto('/')

    const suggestion = await page.evaluate(async (fixtureUrl) => {
      const response = await fetch(fixtureUrl)
      const blob = await response.blob()
      const ocrModule = '/src/lib/ocr.ts'
      const { recognizeBookText } = await import(/* @vite-ignore */ ocrModule)
      return await recognizeBookText(blob)
    }, OCR_FIXTURE_URL)

    expect(suggestion.rawText).toMatch(/Pragmatic\s+Programmer/i)
    expect(suggestion.title).toMatch(/Pragmatic\s+Programmer/i)
    expect(suggestion.authors.join(' ')).toMatch(/David\s+Thomas/i)
    expect(suggestion.authors.join(' ')).toMatch(/Andrew\s+Hunt/i)
    expect(suggestion.series).toMatch(/Pragmatic\s+Bookshelf/i)
    expect(suggestion.isbn).toBeNull()
  })
})
