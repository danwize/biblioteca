import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __recognizeBookText?: (blob: Blob) => Promise<{ rawText: string; isbn: string | null; title: string | null; authors: string[] }>
  }
}

test('loads scanner shell', async ({ page }) => {
  await mockGraphql(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /scan, correct, and catalog your books/i })).toBeVisible()
  await expect(page.getByLabel(/isbn lookup/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /add front cover/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /add back cover/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /add spine/i })).toBeVisible()
})

test('captures back cover barcode and fills lookup metadata', async ({ page }) => {
  await page.addInitScript(() => {
    class MockBarcodeDetector {
      async detect() {
        return [{ rawValue: '9780486214375' }]
      }
    }

    Object.defineProperty(window, 'BarcodeDetector', { value: MockBarcodeDetector })
  })
  await mockGraphql(page)

  await page.goto('/')
  await page.getByRole('button', { name: /add back cover/i }).click()
  await page.getByLabel(/choose back cover image/i).setInputFiles({
    name: 'back-cover.png',
    mimeType: 'image/png',
    buffer: onePixelPng()
  })

  await expect(page.getByLabel(/title/i)).toHaveValue('Barcode Lookup Title')
  await expect(page.getByLabel(/authors/i)).toHaveValue('Barcode Author')
  await expect(page.getByLabel(/isbn lookup/i)).toHaveValue('9780486214375')
  await expect(page.locator('.status-barcode', { hasText: 'Barcode found' })).toBeVisible()
})

test('falls back to OCR when no barcode found and fills metadata', async ({ page }) => {
  await page.addInitScript(() => {
    window.__recognizeBookText = async () => ({
      rawText: 'The OCR Novel\nBy OCR Author\n',
      title: 'The OCR Novel',
      authors: ['OCR Author'],
      isbn: null
    })
  })
  await mockGraphql(page)

  await page.goto('/')
  await page.getByRole('button', { name: /add front cover/i }).click()
  await page.getByLabel(/choose front cover image/i).setInputFiles({
    name: 'front-cover.png',
    mimeType: 'image/png',
    buffer: onePixelPng()
  })

  await expect(page.getByLabel(/title/i)).toHaveValue('The OCR Novel')
  await expect(page.getByLabel(/authors/i)).toHaveValue('OCR Author')
  await expect(page.locator('.status-ocr', { hasText: 'OCR suggested' })).toBeVisible()
})

test('manual field edit survives subsequent lookup', async ({ page }) => {
  await page.addInitScript(() => {
    class MockBarcodeDetector {
      async detect() {
        return [{ rawValue: '9780486214375' }]
      }
    }

    Object.defineProperty(window, 'BarcodeDetector', { value: MockBarcodeDetector })
  })
  await mockGraphql(page)

  await page.goto('/')
  await page.getByRole('button', { name: /add back cover/i }).click()
  await page.getByLabel(/choose back cover image/i).setInputFiles({
    name: 'back-cover.png',
    mimeType: 'image/png',
    buffer: onePixelPng()
  })

  await expect(page.getByLabel(/title/i)).toHaveValue('Barcode Lookup Title')

  await page.getByLabel(/title/i).fill('My Custom Title')

  await page.getByLabel(/isbn lookup/i).fill('9780486214375')
  await page.getByRole('button', { name: /^lookup$/i }).click()

  await expect(page.getByLabel(/title/i)).toHaveValue('My Custom Title')
})

test('mobile coarse-pointer plus opens native capture directly with file fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {}
      })
    })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  })
  await mockGraphql(page)

  await page.goto('/')
  await page.getByRole('button', { name: /add back cover/i }).click()

  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByLabel(/take back cover photo/i)).toHaveAttribute('capture', 'environment')
  await expect(page.getByRole('button', { name: /choose file instead/i })).toBeVisible()
})

test('mobile file fallback processes image with OCR when no barcode found', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {}
      })
    })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    window.__recognizeBookText = async () => ({
      rawText: 'Mobile Book Title\nBy Mobile Author\n',
      title: 'Mobile Book Title',
      authors: ['Mobile Author'],
      isbn: null
    })
  })
  await mockGraphql(page)

  await page.goto('/')
  await page.getByRole('button', { name: /add back cover/i }).click()
  await page.getByRole('button', { name: /choose file instead/i }).click()
  await page.getByLabel(/choose back cover image/i).setInputFiles({
    name: 'back-cover.png',
    mimeType: 'image/png',
    buffer: onePixelPng()
  })

  await expect(page.getByLabel(/title/i)).toHaveValue('Mobile Book Title')
  await expect(page.locator('.status-ocr', { hasText: 'OCR suggested' })).toBeVisible()
})

test('front OCR does not block adding back cover barcode image', async ({ page }) => {
  await page.addInitScript(() => {
    class MockBarcodeDetector {
      async detect() {
        return [{ rawValue: '9780486214375' }]
      }
    }

    Object.defineProperty(window, 'BarcodeDetector', { value: MockBarcodeDetector })
    window.__recognizeBookText = async () => new Promise(() => {})
  })
  await mockGraphql(page)

  await page.goto('/')
  await page.getByRole('button', { name: /add front cover/i }).click()
  await page.getByLabel(/choose front cover image/i).setInputFiles({
    name: 'front-cover.png',
    mimeType: 'image/png',
    buffer: onePixelPng()
  })

  await expect(page.locator('.status-scanning', { hasText: 'Scanning' })).toBeVisible()

  await page.getByRole('button', { name: /add back cover/i }).click()
  await page.getByLabel(/choose back cover image/i).setInputFiles({
    name: 'back-cover.png',
    mimeType: 'image/png',
    buffer: onePixelPng()
  })

  await expect(page.getByLabel(/title/i)).toHaveValue('Barcode Lookup Title')
  await expect(page.locator('.status-barcode', { hasText: 'Barcode found' })).toBeVisible()
})

async function mockGraphql(page: import('@playwright/test').Page) {
  await page.route('**/graphql', async (route) => {
    const request = route.request()
    const body = request.postDataJSON() as { query?: string; variables?: Record<string, string> }
    const query = body.query ?? ''

    if (query.includes('ListCopies')) {
      await route.fulfill({ json: { data: { physicalCopies: [] } } })
      return
    }

    if (query.includes('StartImport')) {
      await route.fulfill({ json: { data: { startImportSession: { id: 'session-e2e' } } } })
      return
    }

    if (query.includes('LookupBook')) {
      await route.fulfill({
        json: {
          data: {
            lookupBookByIsbn: {
              title: 'Barcode Lookup Title',
              subtitle: null,
              authors: ['Barcode Author'],
              isbn13: body.variables?.isbn,
              isbn10: null,
              publisher: 'Barcode Press',
              publishedDate: '2026',
              pageCount: 321,
              subjects: []
            }
          }
        }
      })
      return
    }

    await route.fulfill({ json: { data: {} } })
  })
}

function onePixelPng() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
}
