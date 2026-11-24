import { afterEach, describe, expect, it, vi } from 'vitest'
import { downscaleForOcr, parseOcrSuggestion } from './ocr'

describe('parseOcrSuggestion', () => {
  it('cleans noisy OCR lines and avoids ISBN as the title', () => {
    expect(parseOcrSuggestion('|||\nISBN 978-0-486-21437-5\nThe Real Book Title\nby Jane Reader')).toEqual({
      rawText: '|||\nISBN 978-0-486-21437-5\nThe Real Book Title\nby Jane Reader',
      isbn: '9780486214375',
      title: 'The Real Book Title',
      authors: ['Jane Reader']
    })
  })
})

describe('downscaleForOcr', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function stubPhoto(width: number, height: number) {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close })))
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
      callback(new Blob([`${this.width}x${this.height}`], { type: 'image/jpeg' }))
    })
    return { close, drawImage, toBlob }
  }

  it('shrinks a full-resolution phone photo before OCR', async () => {
    const { close, drawImage } = stubPhoto(4032, 3024)
    const original = new Blob(['photo'], { type: 'image/jpeg' })

    const prepared = await downscaleForOcr(original)

    expect(prepared).not.toBe(original)
    expect(await prepared.text()).toBe('2000x1500')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 1500)
    expect(close).toHaveBeenCalled()
  })

  it('passes small images through untouched', async () => {
    const { toBlob } = stubPhoto(1200, 900)
    const original = new Blob(['photo'], { type: 'image/jpeg' })

    expect(await downscaleForOcr(original)).toBe(original)
    expect(toBlob).not.toHaveBeenCalled()
  })
})
