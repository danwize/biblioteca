import { expect, test } from '@playwright/test'

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
