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

// 12 MP phone photos of a back cover whose barcode is drawn at a normal printed size
// (about 37 mm on a frame-filling cover, ~6 px per bar module), never upscaled.
for (const { name, width, height, degrees, x, y } of [
  { name: 'sideways (90°)', width: 4032, height: 3024, degrees: 90, x: 0.2, y: 0.5 },
  { name: 'sideways (270°)', width: 4032, height: 3024, degrees: 270, x: 0.8, y: 0.5 },
  { name: 'upside down', width: 3024, height: 4032, degrees: 180, x: 0.6, y: 0.25 },
  { name: 'upright', width: 3024, height: 4032, degrees: 0, x: 0.6, y: 0.8 }
]) {
  test(`reads a normal-size barcode from a full-resolution ${name} phone photo`, async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as { BarcodeDetector?: unknown }).BarcodeDetector
    })
    await mockGraphql(page)
    await page.goto('/')

    const photo = await page.evaluate(({ bits, width, height, degrees, x, y }) => {
      const module = 6
      const barHeight = 75 * module
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')!
      context.fillStyle = '#e8e4da'
      context.fillRect(0, 0, width, height)
      context.translate(width * x, height * y)
      context.rotate(degrees * Math.PI / 180)
      const barcodeWidth = bits.length * module
      context.fillStyle = '#fff'
      context.fillRect(-barcodeWidth / 2 - 12 * module, -barHeight / 2 - 4 * module, barcodeWidth + 24 * module, barHeight + 8 * module)
      context.fillStyle = '#111'
      for (let index = 0; index < bits.length; index += 1) {
        if (bits[index] === '1') context.fillRect(-barcodeWidth / 2 + index * module, -barHeight / 2, module, barHeight)
      }
      return canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
    }, { bits: ean13Bits('9780486214375'), width, height, degrees, x, y })

    const started = Date.now()
    await uploadBackCover(page, Buffer.from(photo, 'base64'), 'image/jpeg')
    await expect(page.getByLabel(/isbn lookup/i)).toHaveValue('9780486214375', { timeout: 15_000 })
    console.log(`${name} full-resolution scan took ${Date.now() - started}ms`)
    await expect(page.getByLabel(/title/i)).toHaveValue('Barcode Lookup Title')
  })
}

test('native detector sees the full-resolution photo once, then ZXing takes over, and scan canvases are released', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { nativeSizes: string[]; canvases: HTMLCanvasElement[] }
    state.nativeSizes = []
    state.canvases = []
    const createElement = document.createElement.bind(document)
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      const element = createElement(tagName, options)
      if (tagName.toLowerCase() === 'canvas') state.canvases.push(element as HTMLCanvasElement)
      return element
    }) as typeof document.createElement
    class RecordingBarcodeDetector {
      async detect(source: HTMLCanvasElement) {
        state.nativeSizes.push(`${source.width}x${source.height}`)
        return []
      }
    }
    Object.defineProperty(window, 'BarcodeDetector', { value: RecordingBarcodeDetector })
  })
  await mockGraphql(page)
  await page.goto('/')

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
    context.drawImage(image, 1800, 3000, image.width * 2, image.height * 2)
    const data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
    canvas.width = 0
    canvas.height = 0
    return data
  }, backCoverPng.toString('base64'))

  await uploadBackCover(page, Buffer.from(photo, 'base64'), 'image/jpeg')
  await expect(page.getByLabel(/isbn lookup/i)).toHaveValue('9780486214375', { timeout: 15_000 })

  const { nativeSizes, liveCanvases } = await page.evaluate(() => {
    const state = window as unknown as { nativeSizes: string[]; canvases: HTMLCanvasElement[] }
    return {
      nativeSizes: state.nativeSizes,
      liveCanvases: state.canvases.filter((canvas) => canvas.width * canvas.height > 0).length
    }
  })
  expect(nativeSizes).toEqual(['3024x4032'])
  expect(liveCanvases).toBe(0)
})

test('an unreadable photo moves on to OCR instead of hanging in scanning', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { BarcodeDetector?: unknown }).BarcodeDetector
    ;(window as { __recognizeBookText?: unknown }).__recognizeBookText = async () => ({
      rawText: 'The OCR Novel', title: 'The OCR Novel', authors: [], isbn: null
    })
  })
  await mockGraphql(page)
  await page.goto('/')
  await uploadBackCover(page, Buffer.from('not really an image'), 'image/jpeg')
  await expect(page.getByLabel(/title/i)).toHaveValue('The OCR Novel')
})

function ean13Bits(isbn: string) {
  const l = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
  const r = l.map((code) => [...code].map((bit) => (bit === '1' ? '0' : '1')).join(''))
  const g = r.map((code) => [...code].reverse().join(''))
  const parity = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
  const digits = [...isbn].map(Number)
  const left = digits.slice(1, 7).map((digit, index) => (parity[digits[0]][index] === 'L' ? l : g)[digit]).join('')
  const right = digits.slice(7).map((digit) => r[digit]).join('')
  return `101${left}01010${right}101`
}

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
