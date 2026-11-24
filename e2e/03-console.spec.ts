import { CONSOLE, consoleSignIn, expect, nav, test } from './fixtures';

test.describe('control console', () => {
  test('overview: every school with its health, totals and the activity grid', async ({ page }) => {
    await consoleSignIn(page, 'owner@control.demo');
    await expect(page.locator('.school-card')).toHaveCount(6);
    for (const label of ['Live', 'Quiet', 'Offline', 'Not reporting yet', 'Paused']) {
      await expect(page.locator('.school-card .badge', { hasText: label }).first()).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Needs a look' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Activity, last two weeks' })).toBeVisible();
  });

  test('the running school reports in live, and its trail shows what teachers did', async ({ page }) => {
    await consoleSignIn(page, 'owner@control.demo');
    const sunrise = page.locator('.school-card', { hasText: 'Sunrise Public School (demo)' });
    await expect(sunrise.getByText('Live')).toBeVisible();
    // The e2e school runs with in-memory storage, which the console flags.
    await expect(page.getByText(/Running in test mode/)).toBeVisible();

    await nav(page, 'Audit trail');
    await page.getByRole('combobox', { name: /^School/ }).selectOption({ label: 'Sunrise Public School (demo)' });
    await page.getByRole('combobox', { name: /^Action/ }).selectOption({ label: 'Marked attendance' });
    const first = page.locator('tbody tr').first();
    await expect(first).toContainText('Marked attendance');
    await expect(first).toContainText(/11 present · 1 absent/);
    await expect(first).toContainText('Class teacher');
    // Personal data never reaches the console.
    await expect(page.locator('body')).not.toContainText('Meera');
  });

  test('onboard a school: key shown once, then issue a new one', async ({ page }) => {
    await consoleSignIn(page, 'owner@control.demo');
    await nav(page, 'Schools');
    await page.getByRole('button', { name: 'Onboard a school' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('School name').fill('Deodar Hill School');
    await dialog.getByLabel(/^Code/).fill('deodar-shm');
    await dialog.getByLabel('City').fill('Shimla');
    await dialog.getByRole('button', { name: 'Create and get install key' }).click();
    await expect(dialog.getByRole('heading', { name: 'Deodar Hill School is on the register' })).toBeVisible();
    const settings = await dialog.locator('pre').textContent();
    expect(settings).toMatch(/CONTROL_URL=http:\/\/localhost:8798\nCONTROL_SCHOOL_ID=sch_\w+\nCONTROL_INSTALL_KEY=ik_[\w-]{40,}/);
    await dialog.getByRole('button', { name: "Open the school's page" }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Deodar Hill School' })).toBeVisible();
    await expect(page.getByText('Onboarding', { exact: true })).toBeVisible();
    await expect(page.getByText('Not reporting yet')).toBeVisible();

    await page.getByRole('button', { name: 'New install key' }).click();
    await page.getByRole('button', { name: 'Issue a new key' }).click();
    const fresh = await page.getByRole('dialog').locator('pre').textContent();
    expect(fresh).not.toEqual(settings);
    await page.getByRole('button', { name: 'Done' }).click();
  });

  test('viewers can look but not change anything', async ({ page }) => {
    await consoleSignIn(page, 'viewer@control.demo');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Console team' })).toHaveCount(0);
    await nav(page, 'Schools');
    await expect(page.getByRole('button', { name: 'Onboard a school' })).toHaveCount(0);
    await page.locator('tbody tr').first().click();
    await expect(page.getByRole('button', { name: 'New install key' })).toHaveCount(0);
  });

  test('team: invite a viewer; the console log records it', async ({ page }) => {
    await consoleSignIn(page, 'owner@control.demo');
    await nav(page, 'Console team');
    await page.getByRole('button', { name: 'Invite someone' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Field support');
    await dialog.getByLabel('Email').fill('field@control.demo');
    await dialog.getByRole('button', { name: 'Create invite link' }).click();
    await expect(page.locator('pre')).toContainText(`${CONSOLE}/accept-invite?token=`);
    await expect(page.getByRole('row', { name: /Field support/ })).toContainText('Invite pending');
    await nav(page, 'Console log');
    await expect(page.locator('tbody')).toContainText('Invited a console user');
    await expect(page.locator('tbody')).toContainText('Onboarded a school');
  });

  test('a school login does not open the console', async ({ page }) => {
    await page.goto(`${CONSOLE}/login`);
    await page.getByLabel('Email').fill('principal@demo.school');
    await page.getByLabel('Password').fill('Demo@12345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  });
});
