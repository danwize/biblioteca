import { expect, test } from '@playwright/test'
import path from 'node:path'

// End-to-end walk through the guided capture session using real image
// fixtures: a barcode photo triggers an immediate ISBN lookup and advances the
// guide to the back cover, then Done runs OCR across captures to suggest the
// metadata that barcode lookup did not provide.
const FIXTURES = path.resolve(process.cwd(), '../../apps/web/src/lib/fixtures')
const BARCODE_FIXTURE = path.join(FIXTURES, 'isbn-9780486214375.png')
const OCR_FIXTURE = path.join(FIXTURES, 'book-cover-ocr.png')
const EVIDENCE_DIR = process.env.EVIDENCE_DIR

test('guided capture: barcode lookup, prompt advances, OCR fills gaps on Done', async ({ page }) => {
  test.setTimeout(240_000)
  test.skip(Boolean(process.env.BIBLIOTECA_BASE_URL), 'Needs mocked GraphQL against the dev server')

  const lookups: string[] = []
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as { query: string; variables?: { isbn?: string } }
    if (body.query.includes('physicalCopies')) {
      return route.fulfill({ json: { data: { physicalCopies: [] } } })
    }
    if (body.query.includes('startImportSession')) {
      return route.fulfill({ json: { data: { startImportSession: { id: 'session-1', status: 'Started', scannedIsbn: '9780486214375' } } } })
    }
    if (body.query.includes('lookupBookByIsbn')) {
      lookups.push(body.variables?.isbn ?? '')
      return route.fulfill({
        json: {
          data: {
            lookupBookByIsbn: {
              title: 'Looked-up Title', subtitle: null, authors: [], isbn13: '9780486214375', isbn10: null,
              publisher: 'Dover Publications', publishedDate: '1966', pageCount: 240, subjects: []
            }
          }
        }
      })
    }
    return route.fulfill({ json: { data: {} } })
  })

  await page.setViewportSize({ width: 1280, height: 1100 })
  await page.goto('/')
  await expect(page.getByText('Next: Front cover')).toBeVisible()
  if (EVIDENCE_DIR) await page.screenshot({ path: `${EVIDENCE_DIR}/01-initial-front-prompt.png`, fullPage: true })

  // Front cover photo containing an ISBN barcode.
  await page.locator('input[type=file]').setInputFiles(BARCODE_FIXTURE)
  await expect(page.locator('.capture-strip figure')).toHaveCount(1)
  await expect(page.getByLabel('Title')).toHaveValue('Looked-up Title')
  await expect(page.getByRole('status')).toHaveText('Metadata found. Review and correct before importing.')
  expect(lookups).toEqual(['9780486214375'])
  // Regression check: the guide must advance after a barcode lookup.
  await expect(page.getByText('Next: Back cover')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Capture back cover' })).toBeVisible()
  if (EVIDENCE_DIR) await page.screenshot({ path: `${EVIDENCE_DIR}/02-after-barcode-lookup-advanced-to-back.png`, fullPage: true })

  // Back cover photo (text only, no barcode), then an optional spine selection.
  await page.locator('input[type=file]').setInputFiles(OCR_FIXTURE)
  await expect(page.locator('.capture-strip figure')).toHaveCount(2)
  await expect(page.getByRole('status')).toHaveText('Back cover saved. Capture the next side or choose Done.')
  await page.getByRole('button', { name: 'Add spine' }).click()
  await expect(page.getByText('Next: Spine')).toBeVisible()
  if (EVIDENCE_DIR) await page.screenshot({ path: `${EVIDENCE_DIR}/03-back-captured-spine-offered.png`, fullPage: true })

  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Capture complete. Review and correct the suggested metadata before importing.',
    { timeout: 200_000 }
  )
  // Barcode-provided values are kept; OCR fills authors and series.
  await expect(page.getByLabel('Title')).toHaveValue('Looked-up Title')
  await expect(page.getByLabel('ISBN-13')).toHaveValue('9780486214375')
  await expect(page.getByLabel('Authors')).toHaveValue(/David\s+Thomas/i)
  await expect(page.getByLabel('Series', { exact: true })).toHaveValue(/Pragmatic\s+Bookshelf/i)
  await expect(page.getByRole('button', { name: 'Import book' })).toBeEnabled()
  if (EVIDENCE_DIR) await page.screenshot({ path: `${EVIDENCE_DIR}/04-review-after-done-ocr.png`, fullPage: true })
})
