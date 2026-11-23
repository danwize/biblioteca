export type CaptureKind = 'front' | 'back' | 'spine' | 'additional'

export type StoredImageKind = 'front_cover' | 'back_cover' | 'spine' | 'additional'

export const MISSING_REQUIRED_CAPTURES_MESSAGE = 'Capture at least a front cover and back cover before importing.'

const storedImageKinds: Record<CaptureKind, StoredImageKind> = {
  front: 'front_cover',
  back: 'back_cover',
  spine: 'spine',
  additional: 'additional'
}

export function toStoredImageKind(kind: CaptureKind): StoredImageKind {
  return storedImageKinds[kind]
}

export function hasRequiredCaptures(captures: ReadonlyArray<{ kind: CaptureKind }>): boolean {
  return captures.some((capture) => capture.kind === 'front') && captures.some((capture) => capture.kind === 'back')
}

export function nextRequiredCaptureKind(captures: ReadonlyArray<{ kind: CaptureKind }>, justCaptured?: CaptureKind): CaptureKind {
  const kinds = new Set(captures.map((capture) => capture.kind))
  if (justCaptured) kinds.add(justCaptured)
  if (!kinds.has('front')) return 'front'
  if (!kinds.has('back')) return 'back'
  return 'additional'
}
