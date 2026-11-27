// Runs check_validation.js - the letter-check harness - in a headless browser
// and fails if the letter check got worse. This is what the "Check" workflow
// runs on every pull request; it also runs locally:
//
//   node check_letters_browser.cjs
//
// It starts its own dev server (licence gate bypassed, as in `npm run dev`
// with VITE_LICENSE_DEV_BYPASS) and needs Playwright with Chromium. Cloud
// sessions have both preinstalled; the workflow installs them.
//
// What must hold, as CLAUDE.md describes under "Letter artwork": every letter
// passes `exact` and `light`, `medium` stays high, and nothing that is not the
// letter is accepted - drawn backwards, another letter drawn well, or the
// letter with one stroke left out. The last three are what keep the check
// honest; a change that raises pass rates by relaxing it shows up there first.
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 5179;
const URL = `http://localhost:${PORT}/`;
// Batches, so no single page.evaluate runs for long.
const BATCHES = ['aąbcćdeęfgh', 'ijklłmnńoóp', 'rsśtuwyzźż', 'AĄBCĆDEĘFGH', 'IJKLŁMNŃOÓP', 'RSŚTUWYZŹŻ'];
const TRIALS = 8;
const MIN_MEDIUM = 95;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(server) {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error('The dev server exited before it was ready.');
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch (e) {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`The dev server did not answer on ${URL} within a minute.`);
}

// "pass rate %   exact  light medium  heavy" then one row per mode.
function parse(report) {
  const lines = report.split('\n');
  const head = lines.findIndex((l) => l.startsWith('pass rate'));
  const levels = lines[head].replace('pass rate %', '').trim().split(/\s+/);
  const rates = {};
  for (let i = head + 1; lines[i] && lines[i].trim(); i++) {
    const [mode, ...values] = lines[i].trim().split(/\s+/);
    rates[mode] = Object.fromEntries(levels.map((l, j) => [l, Number(values[j])]));
  }
  const count = (label) => {
    const m = report.match(new RegExp(`${label} \\((\\d+)\\)`));
    return m ? Number(m[1]) : 0;
  };
  return {
    rates,
    reversed: count('reversed accepted'),
    falseAccepts: count('false accepts'),
    missing: count('missing stroke accepted')
  };
}

(async () => {
  // Vite itself rather than through npx, so killing it at the end stops the
  // server and not just a wrapper that leaves it holding the port.
  const server = spawn(
    process.execPath,
    [path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'],
    { cwd: __dirname, env: { ...process.env, VITE_LICENSE_DEV_BYPASS: 'true' }, stdio: ['ignore', 'ignore', 'inherit'] }
  );
  let browser;
  const problems = [];
  try {
    await waitForServer(server);
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    await page.goto(URL);

    for (const letters of BATCHES) {
      const report = await page.evaluate(
        async ({ letters, trials }) => {
          const v = await import('/check_validation.js');
          return v.run({ letters, trials });
        },
        { letters, trials: TRIALS }
      );
      console.log(`\n=== ${letters}\n${report}`);
      const r = parse(report);
      for (const [mode, byLevel] of Object.entries(r.rates)) {
        if (byLevel.exact < 100) problems.push(`${letters}: ${mode} exact ${byLevel.exact}%`);
        if (byLevel.light < 100) problems.push(`${letters}: ${mode} light ${byLevel.light}%`);
        if (byLevel.medium < MIN_MEDIUM) problems.push(`${letters}: ${mode} medium ${byLevel.medium}%`);
      }
      if (r.reversed) problems.push(`${letters}: ${r.reversed} drawn backwards accepted`);
      if (r.falseAccepts) problems.push(`${letters}: ${r.falseAccepts} other letters accepted`);
      if (r.missing) problems.push(`${letters}: ${r.missing} letters with a stroke missing accepted`);
    }
  } catch (e) {
    problems.push(e.message);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }

  if (problems.length) {
    console.error(`\nThe letter check got worse:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\nLetter check: every letter passes, nothing wrong is accepted.');
  process.exit(0);
})();
