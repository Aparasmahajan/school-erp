import type { Browser } from '@playwright/test';
import { expect, nav, schoolSignIn, test } from './fixtures';

/** The demo zone "Main campus" is a 200 m circle around 26.9124, 75.7873 (Jaipur). */
const INSIDE = { latitude: 26.9127, longitude: 75.7874, accuracy: 15 };
const OUTSIDE = { latitude: 26.95, longitude: 75.79, accuracy: 15 };
const BLURRY = { latitude: 26.9127, longitude: 75.7874, accuracy: 600 };

async function staffPage(browser: Browser, geolocation: typeof INSIDE | null, email = 'teacher@demo.school') {
  const ctx = await browser.newContext(
    geolocation ? { geolocation, permissions: ['geolocation'] } : { permissions: [] }
  );
  const page = await ctx.newPage();
  await schoolSignIn(page, email);
  await nav(page, 'My check-in');
  return { ctx, page };
}

test.describe('geofenced staff check-in', () => {
  test('outside the zone: told how far, and the buttons stay locked', async ({ browser }) => {
    const { ctx, page } = await staffPage(browser, OUTSIDE);
    await expect(page.getByRole('heading', { name: /^You're outside / })).toBeVisible();
    await expect(page.getByText(/from its edge/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check in' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Check out' })).toBeDisabled();
    await ctx.close();
  });

  test('an imprecise reading is not trusted', async ({ browser }) => {
    const { ctx, page } = await staffPage(browser, BLURRY);
    await expect(page.getByRole('heading', { name: 'Location not precise enough yet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check in' })).toBeDisabled();
    await ctx.close();
  });

  test('location permission refused: explains how to turn it on', async ({ browser }) => {
    const { ctx, page } = await staffPage(browser, null);
    await expect(page.getByRole('heading', { name: 'Location permission is off' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await ctx.close();
  });

  test('inside the zone: check in, then check out, once each', async ({ browser }) => {
    const { ctx, page } = await staffPage(browser, INSIDE);
    await expect(page.getByRole('heading', { name: "You're inside Main campus" })).toBeVisible();
    await expect(page.getByRole('img', { name: /You are \d+ metres from the centre of Main campus/ })).toBeVisible();
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByText(/Done: recorded at Main campus/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check in' })).toBeDisabled();
    await page.getByRole('button', { name: 'Check out' }).click();
    await expect(page.getByRole('button', { name: 'Check out' })).toBeDisabled();
    const today = page.getByRole('complementary');
    await expect(today.getByText(/^\d{2}:\d{2}/).first()).toBeVisible();
    await ctx.close();
  });

  test('the office sees the check-in, with distance and a map link', async ({ page }) => {
    await schoolSignIn(page, 'principal@demo.school');
    await nav(page, 'Staff attendance');
    const row = page.getByRole('row', { name: /Meera Iyer/ });
    await expect(row).toContainText('Main campus');
    await expect(row.getByRole('link', { name: 'map' })).toHaveAttribute('href', /google\.com\/maps\?q=26\.9127/);
  });

  test('the server re-checks: a forged "inside" click from outside is refused', async ({ browser }) => {
    const { ctx, page } = await staffPage(browser, OUTSIDE, 'office@demo.school');
    // Bypass the locked button and call the API directly with the device's real position.
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/staff-attendance/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'in', lat: 26.95, lng: 75.79, accuracyM: 15 }),
      });
      return res.status;
    });
    expect(status).toBe(422);
    await ctx.close();
  });
});
