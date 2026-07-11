// One Chrome process per oracle run; one incognito BrowserContext per
// scenario (~100ms vs ~1.5s for a fresh launch). Theme/technical-view/
// shortcut settings are pinned via localStorage BEFORE the app boots
// (evaluateOnNewDocument), matching how tools/demo.mjs pins themes.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },   // the contract's default
  narrow:  { width: 390,  height: 844 },
  reflow:  { width: 320,  height: 800 },   // WCAG 1.4.10 threshold (BC-G-12)
};

export async function launchBrowser({ headful = false } = {}) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: headful ? false : 'new',
    args: ['--no-first-run', '--window-size=1440,1000'],
  });
}

// Per-scenario page factory. Returns the page plus the passive buffers every
// scenario gets for free:
//  - dialogs: the app must never open a native dialog; any that appears is
//    recorded (automatic fail evidence) and dismissed (hang prevention).
//  - consoleErrors / pageErrors: for the "console free of uncaught errors"
//    clauses (BC-H-1, BC-H-7).
export async function newScenarioPage(browser, {
  viewport = VIEWPORTS.desktop,
  theme = 'light',                 // 'light' | 'dark' | null (system)
  technicalView = null,            // '1' | '0' | null (leave unset)
  gateShortcuts = null,            // object for capycook-gate-shortcuts, or null
  reducedMotion = false,
} = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);

  const seed = { theme, technicalView, gateShortcuts };
  await page.evaluateOnNewDocument((s) => {
    if (s.theme) localStorage.setItem('capycook-theme', s.theme);
    else localStorage.removeItem('capycook-theme');
    if (s.technicalView !== null) localStorage.setItem('capycook-technical-view', s.technicalView);
    if (s.gateShortcuts !== null) localStorage.setItem('capycook-gate-shortcuts', JSON.stringify(s.gateShortcuts));
  }, seed);

  if (reducedMotion) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  }

  const dialogs = [];
  page.on('dialog', (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    d.dismiss().catch(() => {});
  });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  return { context, page, dialogs, consoleErrors, pageErrors };
}

export async function disposeScenarioPage({ context }) {
  try { await context.close(); } catch { /* already gone */ }
}
