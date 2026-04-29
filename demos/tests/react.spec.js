import { expect, test } from '@playwright/test'

test('React Hook Form demo validates and submits normalized values', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'React Hook Form Demo' })).toBeVisible()

  await page.getByTestId('react-submit').click()

  await expect(page.getByTestId('react-error-workspace-slug')).toContainText('Length must be at least 3 characters.')
  await expect(page.getByTestId('react-error-owner-user-id')).toContainText('Value could not be cast to the required type.')
  await expect(page.getByTestId('react-error-role-label-0')).toContainText('Length must be at least 2 characters.')

  await page.getByTestId('react-workspace-slug').fill('  team-alpha  ')
  await page.getByTestId('react-owner-user-id').fill(' 42 ')
  await page.getByTestId('react-role-label-0').fill('  Ops  ')
  await page.getByTestId('react-submit').click()

  const parsedPayload = JSON.parse(await page.getByTestId('react-result').innerText())

  expect(parsedPayload).toEqual({
    workspace: {
      slug: 'team-alpha',
      ownerUserId: 42
    },
    settings: {
      invitesEnabled: false
    },
    roles: [
      { label: 'Ops' }
    ]
  })
})
