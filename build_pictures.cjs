// Turns a folder of exported word pictures into the artwork the games bundle.
//
// Run: node build_pictures.cjs <folder-of-pngs>
//
// The pictures arrive as 822px PNGs named after the word they show
// ("tortoise.png"), about 400 KB each - 81 MB for the set. The app precaches
// everything it ships so it can run with no network, so they are scaled to
// SIZE pixels and written as WebP into src/assets/pictures/words/, about 17 KB
// each. SIZE is twice the largest circle a picture is drawn in, so it stays
// sharp on a tablet's screen.
//
// Two things about the names:
//
//  - Output names are the word in lower case with nothing else in it
//    ("deckchair.webp"), the same as `slugOf` in src/data/wordsData.js, which
//    is how a word finds its picture. Spaces, hyphens and capitals in an
//    export's name are dropped, so "Deck chair.png" still lands on DECKCHAIR.
//  - A file name is only a pointer to a picture; the spelling a child sees
//    comes from wordsData.js. The script ends by listing any picture no word
//    uses and any word left without a picture, and fails if there are any.
//
// The originals are not kept in the repository (81 MB); re-export them and
// re-run this rather than editing the WebP files.
//
// Chrome does the scaling and encoding, driven over the DevTools protocol like
// build_icons.cjs, so this needs no image library installed - only a Chrome or
// Edge, or CHROME_PATH pointing at one.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const OUT = path.join(__dirname, 'src', 'assets', 'pictures', 'words');
const WORDS = path.join(__dirname, 'src', 'data', 'wordsData.js');

const SIZE = 400;
const QUALITY = 0.8;

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
    throw new Error('No Chrome found to convert with. Set CHROME_PATH to a Chrome or Edge binary.');
  }
  return found;
};

// "Deck chair.png" -> "deckchair". Some unzip tools write a character they
// cannot encode as #U00e9; those are turned back first.
const slugOf = (fileName) =>
  path
    .parse(fileName)
    .name.replace(/#U([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

// --- a very small DevTools protocol client (as in build_icons.cjs) ----------

const connect = (url) => new Promise((resolve, reject) => {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: ok, reject: fail } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) fail(new Error(message.error.message));
    else ok(message.result);
  });

  socket.addEventListener('error', reject);
  socket.addEventListener('open', () => resolve({
    send: (method, params) => new Promise((ok, fail) => {
      const id = nextId++;
      pending.set(id, { resolve: ok, reject: fail });
      socket.send(JSON.stringify({ id, method, params: params || {} }));
    }),
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

// Runs in the page: decode the PNG, draw it scaled, hand back a WebP.
const convertInPage = async (png, size, quality) => {
  const image = new Image();
  image.src = `data:image/png;base64,${png}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, size, size);
  const url = canvas.toDataURL('image/webp', quality);
  if (!url.startsWith('data:image/webp')) throw new Error('this browser cannot encode WebP');
  return url.slice(url.indexOf(',') + 1);
};

const main = async () => {
  const source = process.argv[2];
  if (!source || !fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    console.error('Usage: node build_pictures.cjs <folder-of-pngs>');
    process.exit(1);
  }

  const files = fs.readdirSync(source).filter((f) => /\.png$/i.test(f)).sort();
  if (!files.length) throw new Error(`No .png files in ${source}`);

  const slugs = new Map();
  for (const file of files) {
    const slug = slugOf(file);
    if (slugs.has(slug)) {
      throw new Error(`"${file}" and "${slugs.get(slug)}" both become ${slug}.webp`);
    }
    slugs.set(slug, file);
  }

  const chrome = findChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pictures-'));
  const port = 9333 + Math.floor(Math.random() * 400);
  console.log(`Converting ${files.length} pictures with ${chrome}\n`);

  const browser = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    // Chrome refuses to start sandboxed as root, which is what a container is.
    ...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []),
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(tmp, 'profile')}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let total = 0;
  let cdp;
  try {
    cdp = await connect(await waitForPageTarget(port));
    fs.mkdirSync(OUT, { recursive: true });

    for (const [slug, file] of slugs) {
      const png = fs.readFileSync(path.join(source, file)).toString('base64');
      const result = await cdp.send('Runtime.evaluate', {
        expression: `(${convertInPage})(${JSON.stringify(png)}, ${SIZE}, ${QUALITY})`,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) {
        throw new Error(`${file}: ${result.exceptionDetails.exception?.description || 'conversion failed'}`);
      }
      const webp = Buffer.from(result.result.value, 'base64');
      fs.writeFileSync(path.join(OUT, `${slug}.webp`), webp);
      total += webp.length;
    }
  } finally {
    if (cdp) cdp.close();
    browser.kill();
    // Chrome holds its profile open for a moment after the kill; a leftover
    // temp directory is not worth failing over.
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }

  console.log(`  ${slugs.size} files, ${(total / 1024 / 1024).toFixed(2)} MB in ${path.relative(__dirname, OUT)}\n`);

  // Every word needs its picture and every picture a word.
  const { wordsData } = await import(pathToFileURL(WORDS).href);
  const wanted = new Set(wordsData.map((word) => word.id));
  const onDisk = fs.readdirSync(OUT).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5));
  const unused = onDisk.filter((slug) => !wanted.has(slug));
  const missing = [...wanted].filter((slug) => !onDisk.includes(slug));

  if (unused.length) console.log(`Pictures no word uses: ${unused.join(', ')}`);
  if (missing.length) console.log(`Words without a picture: ${missing.join(', ')}`);
  if (unused.length || missing.length) {
    console.log('\nAdd the word to src/data/wordsData.js, or remove the file.');
    process.exit(1);
  }
  console.log(`All ${wanted.size} words have a picture.`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
