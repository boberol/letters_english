import { useSyncExternalStore } from 'react';
import { install } from '../utils/install';

// Read the install store from a component, the same way useLicense reads the
// licence.
//
// Returns { canInstall, installed, fullscreenAvailable, fullscreen }.
export const useInstall = () =>
  useSyncExternalStore(
    (listener) => install.subscribe(listener),
    () => install.getSnapshot(),
    () => install.getSnapshot()
  );

export default useInstall;
