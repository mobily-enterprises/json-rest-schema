import { expect, test } from '@playwright/test'

test('Vue + Vuetify demo validates and submits normalized values', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Vue + Vuetify Demo' })).toBeVisible()
  await expect(page.getByTestId('vue-invites-panel')).toContainText('Invites enabled')

  const checkboxIcon = page.locator('[data-testid="vue-invites-panel"] .mdi').first()
  await expect(checkboxIcon).toBeVisible()

  const checkboxIconPseudoContent = await checkboxIcon.evaluate(element => {
    return window.getComputedStyle(element, '::before').content
  })

  if (checkboxIconPseudoContent === 'none' || checkboxIconPseudoContent === 'normal' || checkboxIconPseudoContent === '""') {
    throw new Error(`Expected Vuetify checkbox icon glyph to be present, received pseudo content ${checkboxIconPseudoContent}.`)
  }

  await page.getByLabel('Workspace slug').fill('ab')
  await page.getByLabel('Owner user ID').click()
  await expect(page.getByText('Length must be at least 3 characters.')).toBeVisible()

  await page.getByLabel('Workspace slug').fill('  launch-team  ')
  await page.getByLabel('Owner user ID').fill(' 7 ')
  await page.getByLabel('First role label').fill('  Admin  ')
  await page.getByRole('button', { name: 'Submit' }).click()

  const parsedPayload = JSON.parse(await page.getByTestId('vue-result').innerText())

  expect(parsedPayload).toEqual({
    workspace: {
      slug: 'launch-team',
      ownerUserId: 7
    },
    settings: {
      invitesEnabled: false
    },
    roles: [
      { label: 'Admin' }
    ]
  })
})
