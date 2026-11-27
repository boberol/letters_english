// Ads in the Android app: a banner on the menus and, now and then, a full-screen
// ad when a child comes back to the home grid from an activity.
//
// The rules (Borys, November 2026) are about a child who cannot read:
//
// - Never during an activity. The banner shows on the three menus only (the
//   home grid and the two "pick one" screens) and is hidden the moment an
//   activity opens; it never sits under a canvas a finger is drawing on.
// - Full-screen ads only between activities: on the way back to the home grid
//   from one, at most one every INTERSTITIAL_GAP_MS, and none in the first
//   FIRST_INTERSTITIAL_MS after the app opens.
// - Child-directed everywhere: tagged for COPPA (child-directed) and for users
//   under the age of consent (GDPR), rated G at most, and non-personalised.
//   That is what the Families policy on Google Play requires, and why there is
//   no consent form: Google's consent tools are not shown to a child-directed
//   app, which may only receive non-personalised ads anyway.
//
// On the web build, and once ads are removed (the "Remove ads" purchase), every
// call here does nothing.
//
// Until the real ad unit ids are set (VITE_ADMOB_* in .env, see .env.example)
// the app asks for Google's test ads, which are safe to tap and earn nothing.
// A build with test ids must not be released: android_build.mjs refuses to.

import { AdMob, BannerAdPluginEvents, BannerAdPosition, BannerAdSize, MaxAdContentRating } from '@capacitor-community/admob';
import { isNative } from './native';

// Google's published test units for Android.
const TEST_UNITS = {
  banner: 'ca-app-pub-3940256099942544/9214589741',
  interstitial: 'ca-app-pub-3940256099942544/1033173712'
};

const UNITS = {
  banner: import.meta.env.VITE_ADMOB_BANNER_ID || TEST_UNITS.banner,
  interstitial: import.meta.env.VITE_ADMOB_INTERSTITIAL_ID || TEST_UNITS.interstitial
};

export const usingTestAds = UNITS.banner === TEST_UNITS.banner || UNITS.interstitial === TEST_UNITS.interstitial;

export const FIRST_INTERSTITIAL_MS = 2 * 60 * 1000;
export const INTERSTITIAL_GAP_MS = 4 * 60 * 1000;

// Screens a child picks something on. Everything else is an activity.
const MENU_VIEWS = new Set(['tools', 'letters-menu', 'patterns-menu']);

const REQUEST = { isTesting: usingTestAds, npa: true };

const state = {
  enabled: isNative,
  started: false,
  bannerCreated: false,
  bannerShown: false,
  interstitialReady: false,
  interstitialLoading: false,
  interstitialShowing: false,
  openedAt: Date.now(),
  lastInterstitialAt: 0,
  lastView: null,
  bannerHeight: 0
};

// The banner is a native view laid over the bottom of the web page, so the page
// has to leave room for it: --ad-banner-height is what the menus pad by. It is 0
// whenever no banner is showing, including offline, when none loads.
const setBannerSpace = (px) => {
  document.documentElement.style.setProperty('--ad-banner-height', `${Math.max(0, Math.round(px))}px`);
};

const loadInterstitial = async () => {
  if (!state.enabled || state.interstitialReady || state.interstitialLoading) return;
  state.interstitialLoading = true;
  try {
    await AdMob.prepareInterstitial({ adId: UNITS.interstitial, ...REQUEST });
    state.interstitialReady = true;
  } catch {
    // Offline or no fill: try again next time a menu opens.
  } finally {
    state.interstitialLoading = false;
  }
};

// Initialised once, on the first screen; every later call waits for the same
// promise, so nothing asks for an ad before the SDK has its child settings.
let starting = null;
const start = () => {
  if (!starting) starting = initialise();
  return starting;
};

const initialise = async () => {
  state.started = true;
  try {
    await AdMob.initialize({
      tagForChildDirectedTreatment: true,
      tagForUnderAgeOfConsent: true,
      maxAdContentRating: MaxAdContentRating.General,
      initializeForTesting: usingTestAds
    });
  } catch {
    state.enabled = false;
    return;
  }
  AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => {
    state.bannerHeight = height;
    setBannerSpace(state.bannerShown ? height : 0);
  });
  AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
    state.bannerHeight = 0;
    setBannerSpace(0);
  });
  loadInterstitial();
};

const showBanner = async () => {
  if (state.bannerShown) return;
  state.bannerShown = true;
  try {
    if (state.bannerCreated) {
      await AdMob.resumeBanner();
      // A resumed banner does not report its size again.
      setBannerSpace(state.bannerHeight);
    } else {
      state.bannerCreated = true;
      await AdMob.showBanner({
        adId: UNITS.banner,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        ...REQUEST
      });
    }
  } catch {
    state.bannerShown = false;
    setBannerSpace(0);
  }
};

const hideBanner = async () => {
  if (!state.bannerShown) return;
  state.bannerShown = false;
  setBannerSpace(0);
  try {
    await AdMob.hideBanner();
  } catch {
    // Nothing to hide.
  }
};

const maybeInterstitial = async () => {
  const now = Date.now();
  if (
    !state.interstitialReady ||
    state.interstitialShowing ||
    now - state.openedAt < FIRST_INTERSTITIAL_MS ||
    now - state.lastInterstitialAt < INTERSTITIAL_GAP_MS
  ) {
    return;
  }
  state.interstitialReady = false;
  state.interstitialShowing = true;
  state.lastInterstitialAt = now;
  try {
    await AdMob.showInterstitial();
  } catch {
    // Failed to show: the next one waits the full gap like any other.
  } finally {
    state.interstitialShowing = false;
    loadInterstitial();
  }
};

/**
 * Tell the ads which screen is showing. App.jsx calls this on every change of
 * view. Coming back to the home grid from an activity is the only moment a
 * full-screen ad may appear.
 */
export const onScreen = (view) => {
  const previous = state.lastView;
  state.lastView = view;
  if (!state.enabled) return;
  start().then(() => {
    if (!state.enabled || state.lastView !== view) return;
    if (MENU_VIEWS.has(view)) {
      showBanner();
      loadInterstitial();
      if (view === 'tools' && previous && !MENU_VIEWS.has(previous)) maybeInterstitial();
    } else {
      hideBanner();
    }
  });
};

/** For the "Remove ads" purchase: no more ads of any kind, from now on. */
export const disableAds = async () => {
  if (!state.enabled) return;
  state.enabled = false;
  state.bannerShown = false;
  setBannerSpace(0);
  if (!state.started) return;
  try {
    await AdMob.removeBanner();
  } catch {
    // No banner was up.
  }
};
