import { describe, expect, it } from 'vitest'
import { hasRequiredCaptures, toStoredImageKind } from './captureKinds'

describe('toStoredImageKind', () => {
  it('maps UI capture kinds to the stored image kinds', () => {
    expect(toStoredImageKind('front')).toBe('front_cover')
    expect(toStoredImageKind('back')).toBe('back_cover')
    expect(toStoredImageKind('spine')).toBe('spine')
    expect(toStoredImageKind('additional')).toBe('additional')
  })
})

describe('hasRequiredCaptures', () => {
  it('requires both a front cover and a back cover', () => {
    expect(hasRequiredCaptures([])).toBe(false)
    expect(hasRequiredCaptures([{ kind: 'front' }])).toBe(false)
    expect(hasRequiredCaptures([{ kind: 'back' }, { kind: 'spine' }])).toBe(false)
    expect(hasRequiredCaptures([{ kind: 'front' }, { kind: 'additional' }, { kind: 'back' }])).toBe(true)
  })
})
