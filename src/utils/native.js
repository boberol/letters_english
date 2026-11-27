// What the Android app (Capacitor) needs that the browser does not.
//
// The system Back button. In a browser it steps back through history, which
// App.jsx fills with one entry per screen, so Back walks out of a tool and then
// out of the app. A Capacitor app has no browser doing that: without a
// listener, Back closes the app from any screen. So it is mapped onto the same
// stack - one screen back while there is a screen to go back to (the `depth`
// App.jsx keeps on each entry), and only on the home grid out of the app.

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export const isNative = Capacitor.isNativePlatform();

if (isNative) {
  App.addListener('backButton', () => {
    if ((window.history.state?.depth ?? 0) > 0) window.history.back();
    else App.exitApp();
  });
}
