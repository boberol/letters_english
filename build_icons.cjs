// Generates the PWA icons in public/ from public/favicon.svg.
//
// Run: node build_icons.cjs
//
// favicon.svg stays the single source of truth for the mark, so the installed
// icon and the browser tab can never drift apart. Two shapes come out of it:
//
//  - "any"      the favicon as drawn, rounded corners and transparent outside
//               them, for launchers that use the icon unmodified.
//  - "maskable" the same glyph on a full-bleed background with the mark shrunk
//               into the safe zone. Android crops an installed icon to whatever
//               shape the launcher uses - circle, squircle, teardrop - so an
//               icon carrying its own rounded rect gets its corners sliced off
//               and ends up a small square floating in a circle. Full bleed
//               plus padding is the only way to survive every mask.
//
// iOS ignores the manifest and rounds apple-touch-icon.png itself, and paints
// transparency black, so that one is generated from the maskable shape too.
//
// Chrome is driven over the DevTools protocol rather than with its --screenshot
// flag. That flag sizes the capture from --window-size, which on Windows is in
// device pixels while the page viewport is in CSS pixels - so under display
// scaling the icon renders at 80% and loses its bottom and right edges - and it
// cannot go below Chrome's minimum window size at all, which silently produced
// a blank 192px icon. setDeviceMetricsOverride sets the viewport directly and
// has neither problem.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PUBLIC = path.join(__dirname, 'public');
const SOURCE = path.join(PUBLIC, 'favicon.svg');

// Fraction of the canvas the mark may occupy on a maskable icon. The safe zone
// is a circle 80% of the icon wide; 0.72 keeps the glyph inside it with room to
// spare on the diagonal.
const SAFE_SCALE = 0.72;

const ICONS = [
  { name: 'icon-192.png', size: 192, shape: 'any' },
  { name: 'icon-512.png', size: 512, shape: 'any' },
  { name: 'icon-maskable-512.png', size: 512, shape: 'maskable' },
  { name: 'apple-touch-icon.png', size: 180, shape: 'maskable' }
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

const findChrome = () => {
  const found = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('No Chrome found to rasterise with. Set CHROME_PATH to a Chrome or Edge binary.');
  }
  return found;
};

// --- the two shapes, derived from favicon.svg ------------------------------

const svg = fs.readFileSync(SOURCE, 'utf8');

const viewBox = /viewBox="([^"]+)"/.exec(svg);
if (!viewBox) throw new Error('favicon.svg has no viewBox');
const [, , vbWidth, vbHeight] = viewBox[1].trim().split(/\s+/).map(Number);

const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '').trim();

// The background plate and the mark have to be separated: the maskable icon
// keeps the mark but replaces the plate with one that runs off every edge.
const plate = /<rect\b[^>]*>/.exec(inner);
if (!plate) throw new Error('favicon.svg has no <rect> background to bleed');
const plateFill = /fill="([^"]+)"/.exec(plate[0]);
if (!plateFill) throw new Error('favicon.svg background <rect> has no fill');

const mark = inner.replace(plate[0], '').trim();
const cx = vbWidth / 2;
const cy = vbHeight / 2;

const SHAPES = {
  any: inner,
  maskable: `<rect width="${vbWidth}" height="${vbHeight}" fill="${plateFill[1]}"/>
    <g transform="translate(${cx} ${cy}) scale(${SAFE_SCALE}) translate(${-cx} ${-cy})">${mark}</g>`
};

const pageFor = (shape) => `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}
svg{position:fixed;top:0;left:0;width:100vw;height:100vh;display:block}</style>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbWidth} ${vbHeight}">${SHAPES[shape]}</svg>`;

// --- a very small DevTools protocol client ---------------------------------

const connect = (url) => new Promise((resolve, reject) => {
  const socket = new WebSocket(url);
  const pending = new Map();
  const waiters = new Map();
  let nextId = 1;

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: ok, reject: fail } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) fail(new Error(message.error.message));
      else ok(message.result);
      return;
    }
    if (message.method && waiters.has(message.method)) {
      waiters.get(message.method)();
      waiters.delete(message.method);
    }
  });

  socket.addEventListener('error', reject);
  socket.addEventListener('open', () => resolve({
    send: (method, params) => new Promise((ok, fail) => {
      const id = nextId++;
      pending.set(id, { resolve: ok, reject: fail });
      socket.send(JSON.stringify({ id, method, params: params || {} }));
    }),
    once: (method) => new Promise((ok) => waiters.set(method, ok)),
    close: () => socket.close()
  }));
});

const waitForPageTarget = async (port) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Chrome never exposed a debuggable page');
};

const main = async () => {
  const chrome = findChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
  const port = 9333 + Math.floor(Math.random() * 400);

  console.log(`Rasterising with ${chrome}\n`);

  const browser = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(tmp, 'profile')}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let cdp;
  try {
    cdp = await connect(await waitForPageTarget(port));
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 0, g: 0, b: 0, a: 0 }
    });

    for (const { name, size, shape } of ICONS) {
      const pageFile = path.join(tmp, `${name}.html`);
      fs.writeFileSync(pageFile, pageFor(shape));

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: size, height: size, deviceScaleFactor: 1, mobile: false
      });

      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', {
        url: `file://${pageFile.split(path.sep).join('/')}`
      });
      await loaded;

      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: false
      });

      const out = path.join(PUBLIC, name);
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
      const bytes = fs.statSync(out).size;
      console.log(`  ${name.padEnd(24)} ${size}x${size}  ${(bytes / 1024).toFixed(1)} kB`);
    }
  } finally {
    if (cdp) cdp.close();
    browser.kill();
    // Chrome holds files in its profile open for a moment after the kill, so
    // deleting immediately fails with EBUSY. Wait for it to go, and treat a
    // leftover temp directory as not worth failing the build over.
    await new Promise((resolve) => browser.once('exit', resolve));
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // The OS will clear it out of the temp directory eventually.
    }
  }

  console.log('\nDone.');
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
