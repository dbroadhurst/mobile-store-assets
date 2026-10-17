import { chromium, type Browser } from 'playwright';

// Singleton Chromium instance reused across every render in one CLI run.
// Launching the browser is the slowest step (~500ms cold); a matrix render
// composes 30-50 assets so paying that cost once is essential.
//
// The instance is created lazily on first `getBrowser()` call and closed by
// `shutdownBrowser()` at the end of the run. Callers MUST invoke shutdown,
// otherwise the Node process hangs on the open browser handle.

let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (_browser) return _browser;
  if (_launching) return _launching;

  _launching = chromium.launch({
    headless: true,
    args: [
      // Disable per-request animations & font swapping that can cause flaky
      // screenshots. We want every render to be byte-deterministic given the
      // same HTML input.
      '--font-render-hinting=none',
      '--disable-font-subpixel-positioning',
    ],
  }).then(b => {
    _browser = b;
    _launching = null;
    return b;
  });

  return _launching;
}

export async function shutdownBrowser(): Promise<void> {
  if (_browser) {
    const b = _browser;
    _browser = null;
    await b.close();
  }
}
