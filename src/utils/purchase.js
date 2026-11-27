// The one-time "Remove ads" purchase, through Google Play Billing.
//
// A store shaped like `progress`: `subscribe` / `getSnapshot`, read through
// hooks/usePurchase.js. The product is a one-time, non-consumable in-app
// product with the id REMOVE_ADS_ID, created in Play Console (Monetise >
// Products > In-app products) with the price set there - the price shown here
// is whatever Play reports, in the buyer's own currency.
//
// - Owning it switches the ads off for good (utils/ads.js `disableAds`).
// - It is remembered on the tablet (`letter_app_ads_removed`), so a family that
//   paid never sees an ad flash up at launch, offline included. Play is still
//   the authority: once it has answered and says the product is not owned (a
//   refund), the flag is cleared and the ads come back on the next launch.
// - A purchase is acknowledged (`finish`) as soon as Play approves it. Play
//   refunds any purchase left unacknowledged for three days.
// - "Restore purchase" asks Play again, for a family on a new tablet. Play
//   would also report the purchase on its own at the next launch.
//
// The plugin is cordova-plugin-purchase, which Capacitor loads as a Cordova
// plugin: it puts `window.CdvPurchase` in place and is usable after Cordova's
// `deviceready`. On the web none of this exists and the store says so
// (`available: false`), so the "For grown-ups" panel shows nothing to buy.

import { isNative } from './native';
import { disableAds } from './ads';
import { loadSetting, saveSetting } from './storage';

export const REMOVE_ADS_ID = 'remove_ads';
const OWNED_KEY = 'letter_app_ads_removed';

let snapshot = {
  // Play is reachable and the product loaded, so it can be bought.
  available: false,
  // The product's price as Play formats it ("£5.99"), or null until it loads.
  price: null,
  owned: loadSetting(OWNED_KEY, false) === true,
  // A purchase is under way: Play's sheet is open, or a payment is pending.
  busy: false,
  // A short message for the adult after a purchase that did not go through.
  message: null
};
const listeners = new Set();

const update = (changes) => {
  const next = { ...snapshot, ...changes };
  if (Object.keys(changes).every((key) => next[key] === snapshot[key])) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
};

const setOwned = (owned) => {
  if (owned) disableAds();
  saveSetting(OWNED_KEY, owned);
  update({ owned });
};

// A family that already paid gets no ads from the first screen on, before Play
// has been asked anything.
if (snapshot.owned) disableAds();

let store = null;

const start = () => {
  const { CdvPurchase } = window;
  if (!CdvPurchase) return;
  const { ProductType, Platform } = CdvPurchase;
  store = CdvPurchase.store;
  store.verbosity = CdvPurchase.LogLevel.WARNING;

  store.register([{ id: REMOVE_ADS_ID, type: ProductType.NON_CONSUMABLE, platform: Platform.GOOGLE_PLAY }]);

  store
    .when()
    .productUpdated((product) => {
      if (product.id !== REMOVE_ADS_ID) return;
      update({ available: product.canPurchase || product.owned, price: product.pricing?.price ?? null });
      if (product.owned) setOwned(true);
    })
    .approved((transaction) => {
      // No server to check receipts against: the product is a switch on this
      // tablet, not an account, so Play's own signed answer is enough.
      transaction.finish();
    })
    .finished((transaction) => {
      if (transaction.products.some((p) => p.id === REMOVE_ADS_ID)) {
        setOwned(true);
        update({ busy: false, message: null });
      }
    })
    .receiptsReady(() => {
      // Play has answered with what this account owns. Not owning it now, after
      // the tablet remembered owning it, means it was refunded.
      const product = store.get(REMOVE_ADS_ID, Platform.GOOGLE_PLAY);
      if (product && !product.owned && snapshot.owned) setOwned(false);
    });

  store.error((error) => {
    update({ busy: false });
    // Closing Play's sheet is not an error worth telling anyone about.
    if (error.code === CdvPurchase.ErrorCode.PAYMENT_CANCELLED) return;
    update({ message: 'The purchase did not go through. Please try again later.' });
  });

  store.initialize([Platform.GOOGLE_PLAY]);
};

if (isNative) document.addEventListener('deviceready', start, { once: true });

export const purchase = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot() {
    return snapshot;
  },

  /** Opens Play's purchase sheet for "Remove ads". */
  async buy() {
    if (!store || snapshot.busy || snapshot.owned) return;
    const offer = store.get(REMOVE_ADS_ID)?.getOffer();
    if (!offer) {
      update({ message: 'Google Play is not available right now. Please try again later.' });
      return;
    }
    update({ busy: true, message: null });
    const error = await offer.order();
    // The sheet closed. A completed purchase arrives through `finished`; a
    // pending one (cash at a shop, say) stays busy-free and lands later.
    if (error || !snapshot.owned) update({ busy: false });
  },

  /** Asks Play again what this account owns, for a family on a new tablet. */
  async restore() {
    if (!store) return;
    update({ busy: true, message: null });
    await store.restorePurchases();
    // What Play found arrives as product and transaction events just after.
    await new Promise((resolve) => setTimeout(resolve, 800));
    update({
      busy: false,
      message: snapshot.owned ? null : 'No purchase found for the Google account on this tablet.'
    });
  }
};
