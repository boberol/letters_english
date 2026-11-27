# Files that live outside the app

Not part of the build. They are uploaded by hand to Borys's website, acentrum.pl:

| File | Upload to | Why |
| --- | --- | --- |
| `privacy.html` | `https://acentrum.pl/playgoo/privacy.html` | Google Play needs the privacy policy at a public address; the app's "For grown-ups" panel links to it (`PRIVACY_URL` in `src/components/ToolsMenu.jsx`), and the same address goes in Play Console. |
| `app-ads.txt` | `https://acentrum.pl/app-ads.txt` | AdMob checks this file at the root of the website named on the Play listing, and limits ads until it is found. Its one line comes from AdMob (Apps > app-ads.txt). |

`privacy.html` still has three placeholders to fill before it goes up: `{{PUBLISHER}}`, `{{EMAIL}}`
and `{{EFFECTIVE_DATE}}`. If the address changes, change `PRIVACY_URL` and the Play Console entry too.
