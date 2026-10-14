import { expect, test, type Browser, type Page } from '@playwright/test';

async function phone(browser: Browser, code: string, nick: string): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto('/j');
  await page.getByLabel('Kod z telewizora').fill(code);
  await page.getByLabel('Twoje imię (opcjonalnie)').fill(nick);
  await page.getByRole('button', { name: 'Dołącz' }).click();
  await expect(page.getByText('Jesteś w środku!')).toBeVisible();
  return page;
}

test('wieczór: głosowanie z telefonów, dyrygent, ocena i rekord', async ({ page: tv, browser }) => {
  await tv.goto('/');
  await tv.getByLabel('Kto dziś kolęduje?').fill(`Rodzina E2E ${Date.now()}`);
  await tv.getByRole('radio', { name: 'Zimowa noc' }).click();
  await tv.getByRole('button', { name: 'Zaczynamy wieczór' }).click();

  await tv.getByRole('button', { name: /Włącz mikrofon/ }).click();
  await expect(tv.getByText('Cisza na sali!')).toBeVisible();
  await expect(tv.getByText('Cisza na sali!')).toBeHidden({ timeout: 10_000 });
  await expect(tv.locator('html')).toHaveAttribute('data-theme', 'winter');

  const code = (await tv.locator('.join-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  await tv.screenshot({ path: 'test-results/shots/1-lobby.png' });

  const ania = await phone(browser, code, 'Ania');
  const bartek = await phone(browser, code, 'Bartek');
  await expect(tv.getByText('2 na pokładzie')).toBeVisible();

  // Głosowanie: oboje na „Cicha noc” → koniec przed czasem.
  await tv.getByRole('button', { name: /Głosujemy/ }).click();
  await expect(tv.getByText('Głosujcie na telefonach!')).toBeVisible();
  await ania.getByRole('button', { name: 'Cicha noc' }).click();
  await expect(tv.locator('.vote-bar')).toHaveCount(1);
  await tv.screenshot({ path: 'test-results/shots/2-voting.png' });
  await ania.screenshot({ path: 'test-results/shots/2-phone-vote.png' });
  await bartek.getByRole('button', { name: 'Cicha noc' }).click();

  await expect(tv.locator('.winner-title')).toHaveText('Cicha noc');
  await tv.screenshot({ path: 'test-results/shots/3-reveal.png' });

  // Śpiew: telefon pokazuje tekst, Bartek przejmuje batutę.
  await expect(tv.locator('.sing-title')).toHaveText('Cicha noc', { timeout: 10_000 });
  await expect(tv.locator('.line-cur')).toBeVisible({ timeout: 6_000 });
  await expect(ania.locator('.pl.is-cur')).toHaveText(/Cicha noc, święta noc/);
  await bartek.getByRole('button', { name: /Zostań dyrygentem/ }).click();
  await expect(tv.getByText('Dyryguje: Bartek')).toBeVisible();
  await expect(ania.getByText('Dyryguje: Bartek')).toBeVisible();

  const next = bartek.getByRole('button', { name: /Następny wers/ });
  await next.click();
  await expect(tv.locator('.line-cur .line-text')).toHaveText('Pokój niesie ludziom wszem,');
  await expect(ania.locator('.pl.is-cur')).toHaveText(/Pokój niesie ludziom wszem/);
  await tv.screenshot({ path: 'test-results/shots/4-sing.png' });
  await ania.screenshot({ path: 'test-results/shots/4-phone-lyrics.png' });
  await bartek.screenshot({ path: 'test-results/shots/4-phone-conductor.png' });

  // Dyrygent prowadzi do końca (18 wersów).
  for (let i = 0; i < 17; i++) {
    await next.click();
    await tv.waitForTimeout(120);
  }
  await expect(tv.getByRole('button', { name: /Następna kolęda/ })).toBeVisible({ timeout: 10_000 });
  await expect(tv.locator('.score')).toBeVisible();
  await expect(tv.getByText('NOWY REKORD!')).toBeVisible();
  await tv.waitForTimeout(2000);
  await tv.screenshot({ path: 'test-results/shots/5-summary.png' });
  await ania.screenshot({ path: 'test-results/shots/5-phone-summary.png' });

  // Zaśpiewana kolęda jest oznaczona i nie ma jej w głosowaniu.
  await tv.getByRole('button', { name: /Następna kolęda/ }).click();
  await expect(tv.locator('.tile.is-sung')).toHaveCount(1);
  await tv.getByRole('button', { name: /Głosujemy/ }).click();
  await expect(ania.getByRole('button', { name: 'Bóg się rodzi' })).toBeVisible();
  await expect(ania.getByRole('button', { name: 'Cicha noc' })).toHaveCount(0);
  await tv.getByRole('button', { name: 'Zakończ głosowanie' }).click();
  await expect(tv.getByText('Nikt nie zagłosował — losujemy!')).toBeVisible();
  await tv.screenshot({ path: 'test-results/shots/6-roulette.png' });
  await expect(tv.locator('.sing-title')).toBeVisible({ timeout: 15_000 });

  // Odświeżenie TV nie gubi wieczoru.
  await tv.reload();
  await tv.getByRole('button', { name: 'Bez mikrofonu' }).click();
  await expect(tv.locator('.sing-title')).toBeVisible();
  await tv.getByRole('button', { name: /przerwij/ }).click();
  await tv.getByRole('button', { name: /Złota księga/ }).click();
  await expect(tv.locator('.book tbody tr')).toHaveCount(1);
  await tv.screenshot({ path: 'test-results/shots/7-book.png' });
});

test('tryb automatyczny przewija wersy sam', async ({ page: tv }) => {
  await tv.goto('/');
  await tv.getByLabel('Kto dziś kolęduje?').fill(`Auto ${Date.now()}`);
  await tv.getByRole('button', { name: 'Zaczynamy wieczór' }).click();
  await tv.getByRole('button', { name: 'Bez mikrofonu' }).click();
  await tv.getByRole('button', { name: /Cicha noc/ }).click();
  await expect(tv.locator('.line-cur .line-text')).toHaveText('Cicha noc, święta noc,', { timeout: 6_000 });
  await expect(tv.locator('.line-cur .line-text')).toHaveText('Pokój niesie ludziom wszem,', {
    timeout: 8_000,
  });
  await tv.keyboard.press('ArrowDown');
  await expect(tv.locator('.sing-block')).toHaveText(/Zwrotka 2 z 3/);
  await tv.keyboard.press('Escape');
  await expect(tv.getByText('Mikrofon był wyłączony')).toBeVisible();
});
