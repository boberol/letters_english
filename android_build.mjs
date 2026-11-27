// Build the Android app, and prove the result before saying so.
//
//   node android_build.mjs
//   node android_build.mjs --add-fingerprint AA:BB:...   (Google Play's key, no build)
//
// The Android app is a Trusted Web Activity: a shell with no web code of its own
// that opens the live site full screen through the tablet's Chrome. What makes
// Chrome drop the address bar is a two-way claim - the app names the site, and
// the site names the app's signing certificate in /.well-known/assetlinks.json.
// So three things have to come from the same key or the app opens as a browser
// tab with the URL showing: the keystore that signs the build, the fingerprint
// in public/.well-known/assetlinks.json, and the copy of that file the live site
// is actually serving. This script makes the first two from one run and checks
// the third, the same way license_setup.mjs does for the licence keys.
//
// On the first run it creates the release key: android/release.jks, with a
// random password written to android/keystore.properties. Nothing is typed and
// nothing is printed. Both files are gitignored. BACK THEM UP TOGETHER - Android
// refuses an update signed with a different key, so losing them means every
// family has to uninstall and reinstall to get a new version of the shell.
// (The app's content is not affected: that updates from the website.)
//
// Later runs reuse the key. It never overwrites one: a keystore without its
// properties file stops the script rather than being replaced.
//
// Needs JAVA_HOME pointing at a JDK 17-23 and the Android SDK (Android Studio
// installs it). The first build downloads Gradle and the Android build tools.

import { X509Certificate, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ANDROID_DIR = join(ROOT, 'android');
const KEYSTORE_NAME = 'release.jks';
const KEYSTORE_PATH = join(ANDROID_DIR, KEYSTORE_NAME);
const KEYSTORE_PROPS = join(ANDROID_DIR, 'keystore.properties');
const KEY_ALIAS = 'playgoo';
const ASSETLINKS_PATH = join(ROOT, 'public', '.well-known', 'assetlinks.json');
const RELATION = 'delegate_permission/common.handle_all_urls';
const WINDOWS = process.platform === 'win32';

const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

// The host and the package id are read out of the Gradle file rather than
// repeated here, so there is one place to change either.
const gradle = readFileSync(join(ANDROID_DIR, 'app', 'build.gradle'), 'utf8');
const fromGradle = (key) => {
  const match = gradle.match(new RegExp(`${key}:\\s*'([^']+)'`));
  if (!match) fail(`Could not find ${key} in android/app/build.gradle.`);
  return match[1];
};
const HOST = fromGradle('hostName');
const PACKAGE = fromGradle('applicationId');

// --- the toolchain -----------------------------------------------------------

const findJdk = () => {
  const home = process.env.JAVA_HOME;
  if (!home || !existsSync(join(home, 'release'))) {
    fail('JAVA_HOME is not set to a JDK. Gradle needs one, version 17 to 23.');
  }
  const version = readFileSync(join(home, 'release'), 'utf8').match(/JAVA_VERSION="(\d+)/);
  const major = version ? Number(version[1]) : 0;
  // The Gradle this project pins (8.11.1) does not run on anything newer, and
  // the Android plugin needs at least 17. Whatever `java` is on PATH is ignored.
  if (major < 17 || major > 23) {
    fail(`JAVA_HOME is JDK ${major || '?'} (${home}). This build needs JDK 17 to 23.`);
  }
  return home;
};

const findSdk = () => {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    join(homedir(), 'Android', 'Sdk')
  ];
  const sdk = candidates.find((dir) => dir && existsSync(join(dir, 'platform-tools')));
  if (!sdk) fail('Could not find the Android SDK. Install Android Studio, or set ANDROID_HOME.');
  return sdk;
};

const JDK = findJdk();
const SDK = findSdk();
const ENV = { ...process.env, JAVA_HOME: JDK };

// Node will not start a .bat file without a shell, and a shell splits on the
// spaces in "Program Files" - so those get one quoted command line instead.
const run = (command, args, options = {}) => {
  const viaShell = WINDOWS && /\.(bat|cmd)$/i.test(command);
  const result = viaShell
    ? spawnSync(`"${command}" ${args.map((a) => `"${a}"`).join(' ')}`, {
        shell: true,
        env: ENV,
        encoding: 'utf8',
        ...options
      })
    : spawnSync(command, args, { env: ENV, encoding: 'utf8', ...options });
  if (result.error) fail(`Could not run ${command}: ${result.error.message}`);
  return result;
};

const keytool = (args, env = {}) => {
  const result = run(join(JDK, 'bin', WINDOWS ? 'keytool.exe' : 'keytool'), args, {
    env: { ...ENV, ...env }
  });
  if (result.status !== 0) fail(`keytool failed:\n${result.stdout}${result.stderr}`);
  return result.stdout;
};

// --- the release key ---------------------------------------------------------

const readProps = (path) =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
  );

const ensureKeystore = () => {
  if (existsSync(KEYSTORE_PROPS)) {
    const props = readProps(KEYSTORE_PROPS);
    if (!existsSync(join(ANDROID_DIR, props.storeFile || ''))) {
      fail(`android/keystore.properties names ${props.storeFile}, which is not there. Restore it from your backup.`);
    }
    return { props, created: false };
  }
  if (existsSync(KEYSTORE_PATH)) {
    fail(
      'android/release.jks exists but android/keystore.properties (its password) does not.\n' +
        'Restore keystore.properties from your backup. If the app has not been given to anyone yet,\n' +
        'you can instead delete release.jks and run this again to start over with a new key.'
    );
  }

  // base64url, so nothing in it needs escaping in a .properties file.
  const password = randomBytes(24).toString('base64url');
  // The password goes through the environment, not the command line, where any
  // other process on the machine could read it for as long as keytool runs.
  keytool(
    [
      '-genkeypair',
      '-keystore', KEYSTORE_PATH,
      '-storetype', 'PKCS12',
      '-alias', KEY_ALIAS,
      '-keyalg', 'RSA',
      '-keysize', '2048',
      // Google Play requires a key valid beyond 2033; this is about 27 years.
      '-validity', '10000',
      '-dname', 'CN=PlayGoo',
      '-storepass:env', 'PLAYGOO_KEYSTORE_PASSWORD'
    ],
    { PLAYGOO_KEYSTORE_PASSWORD: password }
  );
  // A PKCS12 store has one password for the store and the key alike.
  const props = { storeFile: KEYSTORE_NAME, storePassword: password, keyAlias: KEY_ALIAS, keyPassword: password };
  writeFileSync(
    KEYSTORE_PROPS,
    '# The password for release.jks. Written by android_build.mjs. Back both files up together.\n' +
      Object.entries(props).map(([key, value]) => `${key}=${value}`).join('\n') +
      '\n'
  );
  return { props, created: true };
};

const keystoreFingerprint = (props) => {
  const pem = keytool(
    [
      '-exportcert',
      '-rfc',
      '-keystore', join(ANDROID_DIR, props.storeFile),
      '-alias', props.keyAlias,
      '-storepass:env', 'PLAYGOO_KEYSTORE_PASSWORD'
    ],
    { PLAYGOO_KEYSTORE_PASSWORD: props.storePassword }
  );
  return new X509Certificate(pem).fingerprint256;
};

// --- assetlinks.json ---------------------------------------------------------

const normaliseFingerprint = (value) => {
  const hex = String(value).replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (hex.length !== 64) fail(`Not a SHA-256 fingerprint (64 hex digits): ${value}`);
  return hex.match(/../g).join(':');
};

const fingerprintsIn = (statements) =>
  (Array.isArray(statements) ? statements : [])
    .filter((s) => s?.target?.namespace === 'android_app' && s.target.package_name === PACKAGE)
    .flatMap((s) => s.target.sha256_cert_fingerprints || [])
    .map((f) => f.toUpperCase());

// Fingerprints already in the file are kept. Once the app is on Google Play
// there are two: this key, which signs what you upload, and Google's own, which
// signs what families download. Dropping the second one would put the address
// bar back on every tablet that installed from the store.
const writeAssetLinks = (fingerprints) => {
  let existing = [];
  try {
    existing = fingerprintsIn(JSON.parse(readFileSync(ASSETLINKS_PATH, 'utf8')));
  } catch {}
  const all = [...new Set([...existing, ...fingerprints])];
  const statements = [
    {
      relation: [RELATION],
      target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: all }
    }
  ];
  const next = JSON.stringify(statements, null, 2) + '\n';
  let previous = '';
  try {
    previous = readFileSync(ASSETLINKS_PATH, 'utf8');
  } catch {}
  if (next !== previous) {
    mkdirSync(dirname(ASSETLINKS_PATH), { recursive: true });
    writeFileSync(ASSETLINKS_PATH, next);
  }
  return { all, changed: next !== previous };
};

// What the site is serving right now, which is what Chrome on a tablet checks.
// A site with no such file answers with index.html, so "not JSON" means absent.
const liveFingerprints = async () => {
  try {
    const response = await fetch(`https://${HOST}/.well-known/assetlinks.json`, { cache: 'no-store' });
    return fingerprintsIn(await response.json());
  } catch {
    return [];
  }
};

// --- the build ---------------------------------------------------------------

const ensureLocalProperties = () => {
  const path = join(ANDROID_DIR, 'local.properties');
  if (existsSync(path)) return;
  // Forward slashes: a backslash is an escape character in a .properties file.
  writeFileSync(path, `sdk.dir=${SDK.replace(/\\/g, '/')}\n`);
};

const build = () => {
  ensureLocalProperties();
  console.log('Building (the first run downloads Gradle and the Android build tools)...\n');
  const result = run(join(ANDROID_DIR, WINDOWS ? 'gradlew.bat' : 'gradlew'), ['assembleRelease', 'bundleRelease', '--console=plain', '-q'], {
    cwd: ANDROID_DIR,
    stdio: 'inherit'
  });
  if (result.status !== 0) fail('The Gradle build failed - see above.');
};

// Asks the APK itself which certificate signed it, rather than trusting that
// Gradle picked up the signing config. An unsigned APK builds without complaint
// and then will not install.
const apkFingerprint = (apk) => {
  const toolsDir = join(SDK, 'build-tools');
  const versions = readdirSync(toolsDir)
    .filter((v) => existsSync(join(toolsDir, v, WINDOWS ? 'apksigner.bat' : 'apksigner')))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!versions.length) fail('No apksigner in the Android SDK build-tools.');
  const apksigner = join(toolsDir, versions.at(-1), WINDOWS ? 'apksigner.bat' : 'apksigner');
  const result = run(apksigner, ['verify', '--print-certs', apk]);
  const match = (result.stdout || '').match(/certificate SHA-256 digest:\s*([0-9a-f]{64})/i);
  if (result.status !== 0 || !match) fail(`The APK did not verify:\n${result.stdout}${result.stderr}`);
  return normaliseFingerprint(match[1]);
};

// --- main --------------------------------------------------------------------

const args = process.argv.slice(2);
const addIndex = args.indexOf('--add-fingerprint');

if (addIndex !== -1) {
  const extra = normaliseFingerprint(args[addIndex + 1] || '');
  const { all } = writeAssetLinks([extra]);
  console.log(`\npublic/.well-known/assetlinks.json now lists ${all.length} fingerprint(s) for ${PACKAGE}.`);
  console.log('It takes effect once the site is deployed (push to master).\n');
  process.exit(0);
}

const { props, created } = ensureKeystore();
const fingerprint = keystoreFingerprint(props);
if (created) {
  console.log('\nCreated the release key: android/release.jks and android/keystore.properties.');
  console.log('Back both up somewhere outside this folder before giving the app to anyone.');
}
const { changed } = writeAssetLinks([fingerprint]);
if (changed) console.log('Wrote public/.well-known/assetlinks.json.');

build();

const apk = join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const aab = join(ANDROID_DIR, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (!existsSync(apk)) fail(`The build finished but ${apk} is not there.`);
const signedWith = apkFingerprint(apk);
if (signedWith !== fingerprint) {
  fail(`The APK is signed with ${signedWith},\nnot the release key ${fingerprint}.`);
}

const live = await liveFingerprints();

console.log(`\nPackage      ${PACKAGE}`);
console.log(`Opens        https://${HOST}${fromGradle('launchUrl')}`);
console.log(`Signed with  ${fingerprint}`);
console.log(`\nAPK (install directly)   ${apk}`);
console.log(`AAB (upload to Play)     ${aab}`);

if (live.includes(fingerprint)) {
  console.log(`\nEverything matches: https://${HOST} vouches for this key, so the app opens full screen.\n`);
} else {
  console.log(
    `\nNOT LIVE YET: https://${HOST}/.well-known/assetlinks.json does not list this key.\n` +
      'Until it does, the app still works but opens with the browser address bar showing.\n' +
      'Commit public/.well-known/assetlinks.json and push to master, wait for the deploy,\n' +
      'then run this again - it should end with "Everything matches".\n'
  );
}
