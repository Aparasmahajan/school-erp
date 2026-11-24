import { appendFileSync, mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { CONSOLE, consoleSignIn, expect, nav, schoolSignIn, SCHOOL, test } from './fixtures';

/**
 * Accessibility (axe, WCAG 2.1 A/AA) on every screen of both apps, with a full-page
 * screenshot of each in e2e/.screens for a human look. Fails on serious or critical
 * problems and prints every finding.
 */

async function check(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `e2e/.screens/${name}.png`, fullPage: true });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  // Every finding, minor ones included, goes to a report for review.
  const lines = result.violations.map(
    (v) => `${name}: ${v.impact} ${v.id} — ${v.help} (${v.nodes.length}×) e.g. ${v.nodes[0]?.target.join(' ')}`
  );
  mkdirSync('e2e/.screens', { recursive: true });
  appendFileSync('e2e/.screens/axe-report.txt', lines.length ? lines.join('\n') + '\n' : `${name}: clean\n`);
  expect(bad.map((v) => `${v.id}: ${v.help}`), `accessibility problems on ${name}`).toEqual([]);
}

test.describe('accessibility and screenshots', () => {
  test('school app, signed out', async ({ page }) => {
    await page.goto(`${SCHOOL}/login`);
    await check(page, 'school-login');
  });

  test('school app, every screen (principal)', async ({ page }) => {
    await schoolSignIn(page, 'principal@demo.school');
    await check(page, 'school-dashboard');
    for (const [link, file] of [
      ['Students', 'school-students'],
      ['Classes & sections', 'school-classes'],
      ['Staff attendance', 'school-staff-attendance'],
      ['Staff', 'school-staff'],
      ['Attendance zones', 'school-zones'],
      ['Roles & access', 'school-roles'],
      ['School settings', 'school-settings'],
    ]) {
      await nav(page, link);
      await check(page, file);
    }
    await nav(page, 'Students');
    await page.locator('tbody tr').first().locator('.link-btn').click();
    await expect(page.getByRole('button', { name: 'Edit details' })).toBeVisible();
    await check(page, 'school-student-profile');
  });

  test('school app, teacher screens', async ({ browser }) => {
    const ctx = await browser.newContext({ geolocation: { latitude: 26.9127, longitude: 75.7874, accuracy: 15 }, permissions: ['geolocation'], viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await schoolSignIn(page, 'teacher@demo.school');
    await check(page, 'school-teacher-dashboard');
    await nav(page, 'Attendance');
    await expect(page.locator('.roster-row').first()).toBeVisible();
    await check(page, 'school-attendance');
    await nav(page, 'My check-in');
    await expect(page.locator('.geo-state')).toBeVisible();
    await check(page, 'school-checkin');
    await ctx.close();
  });

  test('school app on a phone', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, geolocation: { latitude: 26.9127, longitude: 75.7874, accuracy: 15 }, permissions: ['geolocation'] });
    const page = await ctx.newPage();
    await schoolSignIn(page, 'teacher@demo.school');
    await check(page, 'phone-dashboard');
    await page.goto(`${SCHOOL}/attendance`);
    await expect(page.locator('.roster-row').first()).toBeVisible();
    await check(page, 'phone-attendance');
    await page.goto(`${SCHOOL}/check-in`);
    await expect(page.locator('.geo-state')).toBeVisible();
    await check(page, 'phone-checkin');
    await ctx.close();
  });

  test('console, every screen (owner)', async ({ page }) => {
    await page.goto(`${CONSOLE}/login`);
    await check(page, 'console-login');
    await consoleSignIn(page, 'owner@control.demo');
    await check(page, 'console-overview');
    await nav(page, 'Schools');
    await check(page, 'console-schools');
    await page.locator('tbody tr', { hasText: "St. Anne's Convent" }).click();
    await expect(page.getByRole('heading', { level: 1, name: "St. Anne's Convent" })).toBeVisible();
    await check(page, 'console-school');
    await nav(page, 'Audit trail');
    await check(page, 'console-trail');
    await nav(page, 'Console team');
    await check(page, 'console-team');
    await nav(page, 'Console log');
    await check(page, 'console-log');
  });

  test('console on a phone', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await consoleSignIn(page, 'owner@control.demo');
    await check(page, 'phone-console-overview');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no sideways scrolling on a phone').toBeLessThanOrEqual(1);
    await ctx.close();
  });
});
