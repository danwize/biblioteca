import { expect, test } from '@playwright/test'

test('loads scanner shell', async ({ page }) => {
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() as { query?: string }
    if ((body.query ?? '').includes('ListCopies')) {
      await route.fulfill({ json: { data: { physicalCopies: [] } } })
      return
    }
    await route.fulfill({ json: { data: {} } })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /scan, correct, and catalog your books/i })).toBeVisible()
  await expect(page.getByLabel(/isbn lookup/i)).toBeVisible()
  await expect(page.getByText(/Next: Front cover/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /add spine/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /add additional photo/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled()
})
