// Build the Android app, and prove the result before saying so.
//
//   node android_build.mjs
//
// The Android app is a Capacitor project in android/: a WebView with the whole
// web build copied inside it, so it runs with no network and no browser. This
// script builds the web app for Android (`npm run build:android`: no service
// worker, copied into android/ by `cap sync`), then the signed bundle for Play
// and an APK to install directly, and checks the APK really is signed with the
// upload key.
//
// On the first run it creates the upload key: android/release.jks, with a
// random password written to android/keystore.properties. Nothing is typed and
// nothing is printed. Both files are gitignored. BACK THEM UP TOGETHER. With
// Play App Signing (the default for a new app) Google holds the key families'
// copies are signed with, and this one only proves an upload came from you; a
// lost upload key can be reset through Play Console support, but it takes days.
//
// Later runs reuse the key. It never overwrites one: a keystore without its
// properties file stops the script rather than being replaced.
//
// Needs JAVA_HOME pointing at a JDK 21-24 and the Android SDK (Android Studio
// installs both; its bundled JDK is fine if it is one of those). The first build
// downloads Gradle and the Android build tools.

import { X509Certificate, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ANDROID_DIR = join(ROOT, 'android');
const KEYSTORE_NAME = 'release.jks';
const KEYSTORE_PATH = join(ANDROID_DIR, KEYSTORE_NAME);
const KEYSTORE_PROPS = join(ANDROID_DIR, 'keystore.properties');
const KEY_ALIAS = 'playgoo';
const WINDOWS = process.platform === 'win32';

const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

// The package id is read out of capacitor.config.json rather than repeated here.
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'capacitor.config.json'), 'utf8')).appId;

// --- the toolchain -----------------------------------------------------------

const findJdk = () => {
  const home = process.env.JAVA_HOME;
  if (!home || !existsSync(join(home, 'release'))) {
    fail('JAVA_HOME is not set to a JDK. Gradle needs one, version 21 to 24.');
  }
  const version = readFileSync(join(home, 'release'), 'utf8').match(/JAVA_VERSION="(\d+)/);
  const major = version ? Number(version[1]) : 0;
  // Capacitor 8 compiles for Java 21, and the Gradle it pins (8.14) does not
  // run on anything newer than 24. Whatever `java` is on PATH is ignored.
  if (major < 21 || major > 24) {
    fail(`JAVA_HOME is JDK ${major || '?'} (${home}). This build needs JDK 21 to 24.`);
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
      '-dname', 'CN=PlayGoo English',
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

// --- the build ---------------------------------------------------------------

const ensureLocalProperties = () => {
  const path = join(ANDROID_DIR, 'local.properties');
  if (existsSync(path)) return;
  // Forward slashes: a backslash is an escape character in a .properties file.
  writeFileSync(path, `sdk.dir=${SDK.replace(/\\/g, '/')}\n`);
};

const build = () => {
  ensureLocalProperties();
  console.log('Building the web app for Android...\n');
  const web = run(WINDOWS ? 'npm.cmd' : 'npm', ['run', 'build:android'], { cwd: ROOT, stdio: 'inherit' });
  if (web.status !== 0) fail('The web build failed - see above.');
  console.log('\nBuilding the Android app (the first run downloads Gradle and the build tools)...\n');
  const result = run(join(ANDROID_DIR, WINDOWS ? 'gradlew.bat' : 'gradlew'), ['assembleRelease', 'bundleRelease', '--console=plain', '-q'], {
    cwd: ANDROID_DIR,
    stdio: 'inherit'
  });
  if (result.status !== 0) fail('The Gradle build failed - see above.');
};

const normaliseFingerprint = (value) => {
  const hex = String(value).replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (hex.length !== 64) fail(`Not a SHA-256 fingerprint (64 hex digits): ${value}`);
  return hex.match(/../g).join(':');
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

const { props, created } = ensureKeystore();
const fingerprint = keystoreFingerprint(props);
if (created) {
  console.log('\nCreated the upload key: android/release.jks and android/keystore.properties.');
  console.log('Back both up somewhere outside this folder before uploading anything to Play.');
}

build();

const apk = join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const aab = join(ANDROID_DIR, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (!existsSync(apk)) fail(`The build finished but ${apk} is not there.`);
const signedWith = apkFingerprint(apk);
if (signedWith !== fingerprint) {
  fail(`The APK is signed with ${signedWith},\nnot the upload key ${fingerprint}.`);
}

console.log(`\nPackage      ${PACKAGE}`);
console.log(`Signed with  ${fingerprint}`);
console.log(`\nAPK (install directly)   ${apk}`);
console.log(`AAB (upload to Play)     ${aab}\n`);
