import { expect, test } from '@playwright/test'

// A 1x1 PNG fixture, sufficient to exercise the upload -> capture flow
// without needing a real barcode or camera device. Resolved relative to the
// playwright config's rootDir (tests/e2e), matching testDir './specs'.
const FRONT_COVER_FIXTURE = 'fixtures/front-cover.png'

test('camera placeholder does not block controls when the camera is inactive', async ({ page }) => {
  await page.goto('/')

  // No getUserMedia call has been made, so the app is in its default,
  // camera-inactive state and the placeholder overlay is showing.
  await expect(page.locator('.camera-placeholder')).toBeVisible()

  const useAPhoto = page.getByText('Use a photo', { exact: true })
  const fileChooserPromise = page.waitForEvent('filechooser')
  // A real (non-forced) click: if the placeholder overlay still covered the
  // whole card, Playwright's actionability check would fail here instead of
  // opening the file chooser.
  await useAPhoto.click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(FRONT_COVER_FIXTURE)

  await expect(page.locator('.capture-strip figure')).toHaveCount(1)

  const doneButton = page.getByRole('button', { name: 'Done' })
  await expect(doneButton).toBeEnabled()
  // Likewise a real click on Done, which sits below the viewport in the same
  // card, must land on the button rather than being intercepted by the
  // overlay.
  await doneButton.click()
  await expect(doneButton).toBeDisabled()
})
