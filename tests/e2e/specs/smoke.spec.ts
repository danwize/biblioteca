import { expect, test } from '@playwright/test'

test('loads scanner shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /scan, correct, and catalog your books/i })).toBeVisible()
  await expect(page.getByLabel(/isbn lookup/i)).toBeVisible()
})
