'use strict';
// Step100: real browser-driven user workflow, intended for the test branch only.
const { spawn } = require('node:child_process');
const { createWriteStream, mkdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

const root = resolve(__dirname, '..');
const screenshotDir = process.env.MYVOCAL_UI_ARTIFACT_DIR || join(root, 'ui-test-artifacts');
mkdirSync(screenshotDir, { recursive: true });
const port = Number(process.env.MYVOCAL_UI_PORT || '4175');
const base = process.env.MYVOCAL_UI_ORIGIN || `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitServer() {
  for (let i = 0; i < 90; i += 1) {
    try { const res = await fetch(base); if (res.ok) return; } catch (_) {}
    await sleep(500);
  }
  throw new Error('Vite server never became ready');
}

async function run() {
  const vite = process.env.MYVOCAL_UI_ORIGIN ? null : spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverOutput = '';
  if (vite) for (const stream of [vite.stdout, vite.stderr]) stream.on('data', d => { serverOutput += String(d).slice(-5000); });
  let browser;
  try {
    await waitServer();
    browser = await chromium.launch({ channel: process.env.MYVOCAL_BROWSER_CHANNEL || 'msedge', headless: true, args: ['--disable-gpu'] });
    const context = await browser.newContext({ acceptDownloads: true, locale: 'ko-KR', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    const browserConsoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') browserConsoleErrors.push(m.text()); });
    page.on('requestfailed', r => browserConsoleErrors.push(`REQUEST ${r.url()} ${r.failure()?.errorText || ''}`));
    page.on('pageerror', e => pageErrors.push(String(e)));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const createButton = page.getByRole('button', { name: '새 음악 만들기' });
    try { await createButton.waitFor({ timeout: 10000 }); }
    catch (err) {
      const diag = { url: page.url(), title: await page.title(), body: (await page.locator('body').innerText()).slice(0, 1500), buttons: await page.locator('button').allTextContents(), pageErrors, browserConsoleErrors };
      console.error('MYVOCAL_OFFLINE_EXE_UI_DIAGNOSTICS=' + JSON.stringify(diag));
      await page.screenshot({ path: join(screenshotDir, '00-error-exe-offline-ui.png'), fullPage: true }).catch(() => {});
      throw err;
    }
    await createButton.click();
    await page.getByPlaceholder('예: 다시 만나는 밤').fill('STEP100 Windows UI 실사용 검증');
    await page.getByPlaceholder('애니메이션 록 발라드를 만들어줘.\n오래 헤어져 있던 친구를 다시 만나는 이야기.\n마지막 후렴은 웅장하게.').fill('Rock 70%와 발라드 30% 느낌의 한국어 노래.');
    await page.getByText('STEP97 · 선택한 로컬 가사/MIDI/스토리보드 생성까지 실행').click();
    await page.getByRole('button', { name: '로컬 제작 파이프라인 실행' }).click();
    const projectTitle = page.getByRole('textbox', { name: '프로젝트 제목' });
    await projectTitle.waitFor();
    assert.equal(await projectTitle.inputValue(), 'STEP100 Windows UI 실사용 검증');
    await page.getByRole('button', { name: '가사', exact: true }).click();
    const lyrics = page.locator('textarea.lyrics-input');
    await lyrics.fill('[Verse 1]\n실제로 저장하고 다시 불러온다\n[Chorus]\n함께 노래한다');
    await page.reload();
    await page.getByRole('button', { name: '가사', exact: true }).click();
    assert.match(await page.locator('textarea.lyrics-input').inputValue(), /실제로 저장하고/);
    await page.screenshot({ path: join(screenshotDir, '01-lyrics-after-reload.png'), fullPage: true });
    await page.getByRole('button', { name: '98~100 · 출력·검증' }).click();
    await page.screenshot({ path: join(screenshotDir, '02-final-delivery.png'), fullPage: true });
    await page.getByRole('button', { name: '프로젝트 목록' }).click();
    const list = page.locator('article.project-item');
    await list.first().waitFor();
    assert.match(await list.first().innerText(), /STEP100 Windows UI 실사용 검증/);
    const downloadWait = page.waitForEvent('download', { timeout: 30000 });
    await list.first().getByRole('button', { name: '전체 백업' }).click();
    const download = await downloadWait;
    const target = join(screenshotDir, download.suggestedFilename());
    await download.saveAs(target);
    const backup = readFileSync(target);
    assert.ok(backup.length > 500, 'backup should contain project metadata');
    const context2 = await browser.newContext({ acceptDownloads: true, locale: 'ko-KR', viewport: { width: 1440, height: 900 } });
    const restored = await context2.newPage();
    restored.on('pageerror', e => pageErrors.push(String(e)));
    await restored.goto(`${base}/#/projects`, { waitUntil: 'domcontentloaded' });
    await restored.locator('input[type="file"][accept*=".myvocal.json"]').setInputFiles({ name: 'MYVOCAL-backup.json', mimeType: 'application/json', buffer: backup });
    await restored.getByText('STEP100 Windows UI 실사용 검증 (복원)', { exact: true }).waitFor({ timeout: 20000 });
    await restored.screenshot({ path: join(screenshotDir, '03-restored-project.png'), fullPage: true });
    assert.deepEqual(pageErrors, [], 'browser must not have unhandled page errors');
    console.log('PASS: Windows browser UI create / Step97 / edit / persistent reload / final tab / backup / restore');
    await context2.close();
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (vite) {
      vite.kill();
      if (vite.exitCode === null) await new Promise(resolve => { vite.once('close', resolve); setTimeout(resolve, 2000); });
      if (vite.exitCode && vite.exitCode !== 0) console.error(serverOutput.slice(-3000));
    }
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
