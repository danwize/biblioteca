import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const backCoverPng = readFileSync(new URL('../../../apps/web/src/lib/fixtures/back-cover-isbn-9780486214375.png', import.meta.url))

test('reads a real barcode with ZXing when the browser has no BarcodeDetector', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { BarcodeDetector?: unknown }).BarcodeDetector
  })
  await expectBarcodeLookup(page, backCoverPng)
})

test('falls back to ZXing when the native BarcodeDetector finds nothing', async ({ page }) => {
  await page.addInitScript(() => {
    class EmptyBarcodeDetector {
      async detect() {
        return []
      }
    }
    Object.defineProperty(window, 'BarcodeDetector', { value: EmptyBarcodeDetector })
  })
  await expectBarcodeLookup(page, backCoverPng)
})

test('reads the barcode from a full-resolution, sideways phone photo', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { BarcodeDetector?: unknown }).BarcodeDetector
  })
  await mockGraphql(page)
  await page.goto('/')

  // Simulate a 12 MP portrait phone shot of the back cover, held sideways.
  const photo = await page.evaluate(async (fixture) => {
    const image = new Image()
    image.src = `data:image/png;base64,${fixture}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 3024
    canvas.height = 4032
    const context = canvas.getContext('2d')!
    context.fillStyle = '#e8e4da'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate(Math.PI / 2)
    context.drawImage(image, -image.width * 3, -image.height * 3, image.width * 6, image.height * 6)
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
  }, backCoverPng.toString('base64'))

  const started = Date.now()
  await uploadBackCover(page, Buffer.from(photo, 'base64'), 'image/jpeg')
  await expect(page.getByLabel(/isbn lookup/i)).toHaveValue('9780486214375', { timeout: 15_000 })
  console.log(`full-resolution scan took ${Date.now() - started}ms`)
  await expect(page.getByLabel(/title/i)).toHaveValue('Barcode Lookup Title')
})

async function expectBarcodeLookup(page: Page, image: Buffer) {
  await mockGraphql(page)
  await page.goto('/')
  await uploadBackCover(page, image, 'image/png')
  await expect(page.getByLabel(/isbn lookup/i)).toHaveValue('9780486214375')
  await expect(page.getByLabel(/title/i)).toHaveValue('Barcode Lookup Title')
  await expect(page.locator('.status-barcode', { hasText: 'Barcode found' })).toBeVisible()
}

async function uploadBackCover(page: Page, buffer: Buffer, mimeType: string) {
  await page.getByRole('button', { name: /add back cover/i }).click()
  await page.getByLabel(/choose back cover image/i).setInputFiles({ name: 'back-cover', mimeType, buffer })
}

async function mockGraphql(page: Page) {
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as { query?: string; variables?: Record<string, string> }
    const query = body.query ?? ''

    if (query.includes('ListCopies')) {
      await route.fulfill({ json: { data: { physicalCopies: [] } } })
    } else if (query.includes('StartImport')) {
      await route.fulfill({ json: { data: { startImportSession: { id: 'session-e2e' } } } })
    } else if (query.includes('LookupBook')) {
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
    } else {
      await route.fulfill({ json: { data: {} } })
    }
  })
}
