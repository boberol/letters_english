import { useSyncExternalStore } from 'react';
import { license } from '../utils/license';

// Read the licence store from a component, the same way useProgress reads
// progress: no provider and no tree changes, just a subscription to a store
// that lives outside React.
//
// Returns { status, busy, error, claims }, where status is one of
// 'checking' | 'locked' | 'unlocked' | 'unconfigured'.
export const useLicense = () =>
  useSyncExternalStore(
    (listener) => license.subscribe(listener),
    () => license.getSnapshot(),
    () => license.getSnapshot()
  );

export default useLicense;
