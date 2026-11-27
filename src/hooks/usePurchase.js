import { useSyncExternalStore } from 'react';
import { purchase } from '../utils/purchase';

// Read the "Remove ads" purchase store from a component: { available, price,
// owned, busy, message }. Stable until something actually changes.
export const usePurchase = () =>
  useSyncExternalStore(
    (listener) => purchase.subscribe(listener),
    () => purchase.getSnapshot(),
    () => purchase.getSnapshot()
  );

export default usePurchase;
