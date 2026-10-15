import { expect, test, type Browser, type Page } from '@playwright/test';

const PASSWORD = 'opłatek24';

/** Nowy telefon (osobny kontekst przeglądarki) — przez link z kodu QR albo wpisany kod. */
async function phone(browser: Browser, how: { url?: string; code?: string }, nick: string): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  if (how.url) {
    await page.goto(new URL(how.url).pathname + new URL(how.url).hash);
  } else {
    await page.goto('/j');
    await page.getByLabel('Albo wpiszcie kod z telewizora').fill(how.code!);
    await page.getByLabel('Twoje imię (opcjonalnie)').fill(nick);
    await page.getByRole('button', { name: 'Dołącz' }).click();
  }
  await expect(page.getByText('Jesteś w środku!')).toBeVisible();
  // Klucz z linku nie zostaje w pasku adresu.
  expect(page.url()).not.toContain('#k=');
  return page;
}

async function startEvening(tv: Page, name: string, opts: { theme?: string; mic?: boolean } = {}) {
  await tv.goto('/');
  await tv.getByRole('button', { name: 'Pomiń ✕' }).click();
  await tv.getByLabel('Kto dziś kolęduje?').fill(name);
  await tv.getByLabel('Hasło grupy').fill(PASSWORD);
  if (opts.theme) await tv.getByRole('radio', { name: opts.theme }).click();
  await tv.getByRole('button', { name: 'Zaczynamy wieczór' }).click();
  if (opts.mic) {
    await tv.getByRole('button', { name: /Włącz mikrofon/ }).click();
    await expect(tv.getByText('Cisza na sali!')).toBeVisible();
    await expect(tv.getByText('Cisza na sali!')).toBeHidden({ timeout: 10_000 });
  } else {
    await tv.getByRole('button', { name: 'Bez mikrofonu' }).click();
  }
  await expect(tv.locator('.join-card[data-join-url]')).toBeVisible();
}

test('samouczek przy pierwszym otwarciu: kroki, przerwanie i ponowne otwarcie', async ({ page: tv }) => {
  await tv.goto('/');
  const dialog = tv.getByRole('dialog', { name: 'Samouczek' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Krok 1 z 7')).toBeVisible();
  await dialog.getByRole('button', { name: 'Dalej ▶' }).click();
  await expect(dialog.getByRole('heading', { name: 'Wasze konto rodzinne' })).toBeVisible();
  await tv.keyboard.press('ArrowRight');
  await expect(dialog.getByText('Krok 3 z 7')).toBeVisible();
  await tv.screenshot({ path: 'test-results/shots/0-tutorial.png' });
  await tv.keyboard.press('Escape'); // przerwanie w dowolnym momencie
  await expect(dialog).toBeHidden();
  await tv.reload();
  await expect(dialog).toBeHidden(); // drugi raz już się nie narzuca
  await tv.getByRole('button', { name: 'Jak to działa?' }).click();
  await expect(dialog.getByText('Krok 1 z 7')).toBeVisible();
  await dialog.getByRole('button', { name: 'Pomiń ✕' }).click();
  await expect(dialog).toBeHidden();
});

test('wieczór: konto z hasłem, QR z kluczem, głosowanie, dyrygent, ocena i rekord', async ({
  page: tv,
  browser,
}) => {
  const group = `Rodzina E2E ${Date.now()}`;
  await startEvening(tv, group, { theme: 'Zimowa noc', mic: true });
  await expect(tv.getByText(/Założyliśmy konto/)).toBeVisible();
  await expect(tv.locator('html')).toHaveAttribute('data-theme', 'winter');

  const joinUrl = (await tv.locator('.join-card').getAttribute('data-join-url'))!;
  expect(joinUrl).toMatch(/\/j#k=[\w-]{20,}$/);
  const code = (await tv.locator('.join-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{6}$/);
  await tv.screenshot({ path: 'test-results/shots/1-lobby.png' });

  const ania = await phone(browser, { url: joinUrl }, 'Ania');
  const bartek = await phone(browser, { code }, 'Bartek');
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

  // Śpiew: telefon pokazuje tekst, Bartek przejmuje batutę.
  await expect(tv.locator('.sing-title')).toHaveText('Cicha noc', { timeout: 10_000 });
  await expect(tv.locator('.line-cur')).toBeVisible({ timeout: 6_000 });
  await expect(ania.locator('.pl.is-cur')).toHaveText(/Cicha noc, święta noc/);
  await bartek.getByRole('button', { name: /Zostań dyrygentem/ }).click();
  await expect(tv.getByText('Dyryguje: Bartek')).toBeVisible();

  const next = bartek.getByRole('button', { name: /Następny wers/ });
  await next.click();
  await expect(tv.locator('.line-cur .line-text')).toHaveText('Pokój niesie ludziom wszem,');
  await expect(ania.locator('.pl.is-cur')).toHaveText(/Pokój niesie ludziom wszem/);
  // Akordy na telefonie (włącza każdy sam).
  await ania.getByRole('button', { name: '🎸' }).click();
  await expect(ania.locator('.pl.is-cur .chord-row')).toHaveText(/G7.*C/);
  await ania.screenshot({ path: 'test-results/shots/4-phone-lyrics.png' });

  for (let i = 0; i < 17; i++) {
    await next.click();
    await tv.waitForTimeout(120);
  }
  await expect(tv.getByRole('button', { name: /Następna kolęda/ })).toBeVisible({ timeout: 10_000 });
  await expect(tv.getByText('NOWY REKORD!')).toBeVisible();
  await tv.waitForTimeout(1500);
  await tv.screenshot({ path: 'test-results/shots/5-summary.png' });

  // Zaśpiewana kolęda jest oznaczona i nie ma jej w głosowaniu.
  await tv.getByRole('button', { name: /Następna kolęda/ }).click();
  await expect(tv.locator('.tile.is-sung')).toHaveCount(1);
  await tv.getByRole('button', { name: /Głosujemy/ }).click();
  await expect(ania.getByRole('button', { name: 'Bóg się rodzi' })).toBeVisible();
  await expect(ania.getByRole('button', { name: 'Cicha noc' })).toHaveCount(0);
  await tv.getByRole('button', { name: 'Zakończ głosowanie' }).click();
  await expect(tv.getByText('Nikt nie zagłosował — losujemy!')).toBeVisible();
  await expect(tv.locator('.sing-title')).toBeVisible({ timeout: 15_000 });

  // Odświeżenie TV i telefonu nie gubi wieczoru.
  await tv.reload();
  await tv.getByRole('button', { name: 'Bez mikrofonu' }).click();
  await expect(tv.locator('.sing-title')).toBeVisible();
  await ania.reload();
  await expect(ania.locator('.pl.is-cur')).toBeVisible();
  await tv.getByRole('button', { name: /przerwij/ }).click();

  // Nowy kod: stary link przestaje działać.
  await tv.getByRole('button', { name: /Ustawienia/ }).click();
  await tv.getByRole('button', { name: /Nowy kod i link/ }).click();
  await tv.getByRole('button', { name: 'Zamknij' }).click();
  await expect(tv.locator('.join-card')).not.toHaveAttribute('data-join-url', joinUrl);
  const stranger = await browser.newPage();
  await stranger.goto(new URL(joinUrl).pathname + new URL(joinUrl).hash);
  await expect(stranger.getByText('Nie ma wieczoru o takim kodzie')).toBeVisible();

  await tv.getByRole('button', { name: /Złota księga/ }).click();
  await expect(tv.locator('.book tbody tr')).toHaveCount(1);
});

test('złe hasło do istniejącej grupy nie wpuszcza', async ({ page: tv, browser }) => {
  const group = `Sejf ${Date.now()}`;
  await startEvening(tv, group);
  const other = await browser.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Pomiń ✕' }).click();
  await other.getByLabel('Kto dziś kolęduje?').fill(group.toUpperCase());
  await other.getByLabel('Hasło grupy').fill('zgaduję');
  await other.getByRole('button', { name: 'Zaczynamy wieczór' }).click();
  await expect(other.getByText('Złe hasło dla tej grupy.')).toBeVisible();
});

test('akordy z chwytami i podkład w trybie automatycznym', async ({ page: tv }) => {
  const errors: string[] = [];
  tv.on('pageerror', (e) => errors.push(e.message));
  await startEvening(tv, `Auto ${Date.now()}`);
  await tv.getByRole('button', { name: /Ustawienia/ }).click();
  await tv.getByLabel(/Pokazuj akordy nad tekstem/).check();
  await tv.getByText('Zaawansowane: podkład muzyczny').click();
  await tv.getByLabel(/Graj podkład/).check();
  await tv.getByRole('radio', { name: /Gitara/ }).click();
  await tv.screenshot({ path: 'test-results/shots/8-settings.png' });
  await tv.getByRole('button', { name: 'Zamknij' }).click();

  await tv.getByRole('button', { name: /Cicha noc/ }).click();
  await expect(tv.locator('.line-cur .line-text')).toHaveText('Cicha noc, święta noc,', { timeout: 6_000 });
  await expect(tv.locator('.line-cur .chord-row')).toHaveText('C');
  await expect(tv.locator('.chord-panel .chord-diagram').first()).toBeVisible();
  await expect(tv.getByText('🎹 Podkład')).toBeVisible();
  await expect(tv.locator('.line-cur .line-text')).toHaveText('Pokój niesie ludziom wszem,', {
    timeout: 8_000,
  });
  // Tonacja w górę o cały ton: C → D, G7 → A7.
  await tv.getByRole('button', { name: 'Wyżej o pół tonu' }).click();
  await tv.getByRole('button', { name: 'Wyżej o pół tonu' }).click();
  await expect(tv.locator('.key-ctl strong')).toHaveText('D');
  await expect(tv.locator('.line-cur .chord-row')).toHaveText(/A7.*D/);
  await tv.screenshot({ path: 'test-results/shots/9-chords.png' });
  await tv.keyboard.press('ArrowDown');
  await expect(tv.locator('.sing-block')).toHaveText(/Zwrotka 2 z 3/);
  await tv.keyboard.press('Escape');
  await expect(tv.getByText('Mikrofon był wyłączony')).toBeVisible();
  expect(errors).toEqual([]);
});

test('kilku gości w kartach jednej przeglądarki (?gosc=…)', async ({ page: tv, context }) => {
  await startEvening(tv, `Goście ${Date.now()}`);
  const joinUrl = new URL((await tv.locator('.join-card').getAttribute('data-join-url'))!);
  for (const g of ['1', '2', '3']) {
    const p = await context.newPage();
    await p.goto(`/j?gosc=${g}${joinUrl.hash}`);
    await expect(p.getByText('Jesteś w środku!')).toBeVisible();
    await expect(p).toHaveURL(new RegExp(`gosc=${g}`));
  }
  await expect(tv.getByText('3 na pokładzie')).toBeVisible();
});

test('panel statystyk z logowaniem', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Login').fill('lama');
  await page.getByLabel('Hasło').fill('zle');
  await page.getByRole('button', { name: 'Zaloguj' }).click();
  await expect(page.getByText('Zły login lub hasło')).toBeVisible();
  await page.getByLabel('Hasło').fill('bezdomna');
  await page.getByRole('button', { name: 'Zaloguj' }).click();
  await expect(page.getByRole('heading', { name: /statystyki/ })).toBeVisible();
  await expect(page.locator('.stat-tile').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Cicha noc' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Złe hasło grupy' }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/10-admin.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: /statystyki/ })).toBeVisible(); // sesja w ciasteczku
  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page.getByRole('button', { name: 'Zaloguj' })).toBeVisible();
});
