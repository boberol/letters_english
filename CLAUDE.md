# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The app

**This repository is the English edition of PlayGoo**, being converted from the Polish app
("Nauka Liter", imported unchanged in the first commit). The English edition is free on Google Play
with child-directed AdMob ads and a one-time "Remove ads" purchase; it has no activation codes and no
licence server. The conversion is done step by step (English letters, text, word bank, a Capacitor
Android app, ads, the purchase); until a step lands, the notes below still describe the Polish app
it came from, so Polish names and strings in them are expected.

"PlayGoo" — a handwriting/literacy app for pre-readers. Design constraints that drive
most decisions here: the user cannot read a sentence, taps with a whole finger on a tablet, and
may be offline. So: pictures before words, no landing page in front of the activity grid, no
network requests at runtime (sounds are synthesised, artwork and the letter font are bundled).

**There is no voice, on purpose** (removed September 2026; Borys confirmed in November: "no voice,
pictures only"). Do not add speech synthesis or recorded clips. Anything a child must be told is
shown instead - see **Feedback a pre-reader can follow** below.

## Commands

```bash
npm run dev      # Vite dev server on :5173
npm run build    # production build to dist/
npm run lint     # eslint (0 errors and 0 warnings expected)
npm run preview  # serve the built output
npm run build:android  # web build for the Android app (no service worker), copied into android/
```

There is **no test framework** — no `npm test`, no runner installed. Verification is done by
running the app and exercising it in the browser. **Every pull request runs `.github/workflows/check.yml`**:
lint, a test build, and `node check_letters_browser.cjs`, which runs the letter-check harness
(`check_validation.js`) in headless Chromium against its own dev server and fails if any letter stops
passing `exact`/`light`, `medium` drops below 95%, or anything backwards, wrong or incomplete is
accepted. It takes about 30 seconds and runs locally the same way. Prefer the Browser pane (`preview_start` with
`{name: "letters-dev"}`, configured in `.claude/launch.json`) over `npm run dev` in a shell.
`{name: "letters-preview"}` serves the built output instead, which is the only way to exercise the
service worker — it is switched off in dev (see **Offline and installing**).

`fix_svgs.cjs`, `fix_y.cjs`, `build_letters.cjs`, `build_icons.cjs`, `preview_letters.cjs` and
`check_letters.cjs` are Node scripts used to build and check the letter SVGs. They are ESLint-ignored and are not part
of the build. See **Letter artwork** below. `check_validation.js` is their browser-side partner: it
measures how the letter check treats realistic finger drawings, and is imported into the dev
server's console rather than run with Node (see the end of **Letter artwork**).

`build_pictures.cjs <folder-of-pngs>` turns exported word pictures into the WebP files the picture
games bundle, and checks them against the word list. Also ESLint-ignored. See **Pictures**.

`android_build.mjs` builds the Android app out of `android/`, a Capacitor (Gradle) project that
needs a JDK and the Android SDK as well as `npm run build:android`. Also
ESLint-ignored. See **The Android app**.

## Architecture

### Navigation

`App.jsx` is the only router: a `view` string in state, mirrored into `history.pushState` so the
Android back gesture steps back a screen instead of leaving the app. Two maps drive it —
`TOOL_VIEWS` (home-screen card id → view) and `VIEW_REGISTRY` (view → component). Every tool takes
exactly `{ onBack }`, so adding one means adding a `TOOLS_LIST` entry in `ToolsMenu.jsx` plus a
line in each map. The two-screen tools are the exception: letter tracing (`letters-menu` →
`letters-stage`) and pattern families (`patterns-menu` → `patterns-stage`) carry a payload in
`selection` — a letter, or a family id — and are rendered explicitly rather than from the registry.

**Opening a screen pushes a history entry; every back arrow goes through `back()`, which calls
`history.back()`.** The back arrows used to push the parent screen as a new entry, so the stack only
grew and the system Back button walked back into screens the child had already left instead of
leaving the app. Entries carry a `depth`; at depth 0 `back()` replaces instead, and a second tap
while a `history.back()` is in flight is ignored (it would step out of the app on a tablet).

### Feedback a pre-reader can follow

The app has no voice, so a card of Polish text explains nothing to the child. The card stays, for
the adult, but short, and the **canvas does the explaining**:

- **Start dots.** Tracing (`Po śladzie`) shows a filled dot where each stroke of the letter begins,
  numbered when there is more than one; Kształty and Szlaczki already had one.
- **A wrong letter or a wrong direction replays the right strokes** over the child's own ink, from
  their start dots, with the bee pen (`demo` on `LetterCanvas`, the `svg-overlay` in Kształty and
  Szlaczki). Size and placement misses outline where the letter belongs (`highlight`). `SHOWS` in
  `LearningStage` maps each check `reason` to one of the two.
- **"Nothing drawn" is not a mistake and has no card**: the canvas edge and the start dots pulse.
- **Cards peek** (`<FeedbackModal peek>`): a light shade and a compact card over the header, so the
  child sees their drawing next to the replay. The old full-screen blur hid exactly that.
- **Pierwsza głoska does not print the word it asks about**; the child names the picture. The word
  appears with "Brawo".

### How a drawn letter is judged

This is the most subtle part of the codebase; read these three files together before touching any
of them.

- **`utils/strokeGeometry.js`** — every stroke width is a *fraction* of the viewBox, never an
  absolute unit count. Letters arrive from two sources with wildly different scales (`parseSVG`
  reframes assets into a ~1370-unit box; the `lettersData` fallbacks use 100), so hard-coded
  widths render ~13× too thin for one of them. Also holds the shared `TOLERANCE` curve so the
  letter check and the shape check judge the same wobble the same way.
- **`utils/strokePath.js`** — compares *trajectories*, not pixels. Both the child's strokes and
  the target are resampled to equally spaced points, which preserves the direction the pen
  travelled: a letter drawn bottom-up is a large distance, not a match. Points are paired by
  **dynamic time warping**, not by index. Index pairing assumed a hand spends the same share of a
  stroke on each part of the letter as the artwork does, so an `a` whose bowl began at one o'clock
  instead of three was out of step from its first point and failed however neatly it was drawn.
  Warping lets either path run ahead for a stretch, but only forwards, so backwards still cannot
  line up. Strokes are compared two ways: paired one to one, and joined into one sequence of ink
  (which forgives a finger lifted instead of retracing a stem, or two strokes drawn as one). The
  joined comparison is also what warping would let *hide* a missing or extra stroke — an `a`
  matches an `ą` by parking the ogonek on the foot of the stem — so every stroke on each side must
  have partners of its own along at least 35% of its length (`strokesCovered`); distance cannot
  tell a wobbly kreska from a missing one, but a missing one only borrows points its neighbour is
  already using. Parsed targets are cached in a `WeakMap` (111ms → 2.1ms per check), and the
  warping reuses its buffers: a check is 5–11ms on a desktop, most of it the 31 rivals.
- **`utils/validation.js`** — orders its checks deliberately: empty → size → reversed →
  extra-marks → score → wrong-letter → off-line. Placement is checked *last*, because "write it on
  the line" is only useful advice once the shape is right. It returns a `reason` string, and
  `LearningStage` renders one modal per reason — adding a reason means adding its modal.

`validateDrawing` takes an `alternatives` list (every other letter) and asks the opposite
question: does some other letter fit this drawing clearly better? That is what separates a real
`k` from a messy `h`. Two things about how "better" is measured, each of which once turned a right
answer into "you drew a different letter". When tracing it compares raw pixel distances, not
scores: a score is divided by the letter's size, so a tall letter divided the same stray ink by
more and a scrappy `u` came out a better `k`. And a rival that had to ignore more of the drawing
(`ignored` - small marks nothing paired with, dropped as stray taps) cannot win on fit, because a
`z` fits a `ż` perfectly once the dot is thrown away; one that uses a mark the asked letter ignored
wins outright if it is a good fit itself. Tracing also judges every letter against at least a
third of the canvas (`MIN_TRACED_SIZE`), since a finger strays by pixels, not by a share of the
letter.

Freehand (`independent`) mode is position-invariant horizontally but **not** vertically —
`BASELINE_TOLERANCE` enforces height on the ruled line, since that is what the guides teach. It is
measured at the **baseline**, not the middle (`verticalOffset`): the target's baseline as a share of
its own height, applied to the drawing. By middles, a short `b`, `l` or `k` standing exactly on the
line read as sunk below it and got "za nisko". The middle is still measured, and a drawing is only
called off the line when both measures say so, the same way, so a letter merely a little big or small
is not sent up or down the page (and `check_validation.js`'s scaled letters still pass).

Tracing (`guided`) has two checks of its own. A drawing under `GUIDED_MIN_SIZE` (0.75) of the guide is
`too-small`: `MIN_TRACED_SIZE` made a letter at 60% of the guide pass as "Wspaniale!". And a drawing
that fails in place but is the right letter when compared position-invariantly - drawn beside the
guide - is `off-guide` ("Teraz narysuj ją na szarym śladzie") with the outline, not `wrong-shape` with
a replay of strokes the child already got right.

**Round letters start where the `c` does.** `o`, `ó`, `O` and `Ó` begin at `ROUND_START_DEG` (55°
clockwise from twelve, measured off the `c`'s first point) and run anticlockwise, so `o`, `c` and `a`
start with the same movement. `build_letters.cjs` re-points the three it writes with `startAtClock`;
`o.svg` is an original and carries the same path by hand. The `i` stem starts on the dashed line.

`ShapesTool` and `PatternsTool` still judge *coverage* with the older pixel mask in
`utils/shapeBoundary.js`, but **direction is checked on every stroke** by `utils/strokeDirection.js`:
the finished stroke is followed along the guide (sampled into canvas pixels, closed shapes wrapping
round) and a stroke that runs mostly backwards ends the attempt at once with "W drugą stronę!" and a
replay of the right way. Pixels do not record direction, so before this a line traced right to left
or a circle drawn clockwise got "Idealnie w liniach!". Borys decided in November 2026 that both
tools must reject the wrong direction.

**Kształty also accepts a shape drawn a side at a time, the way a kindergarten teaches it**: verticals
top to bottom, horizontals left to right, lifting the pen between sides (Borys, November 2026: "top
to bottom, like letters"). A stroke that runs against the stored path is still accepted if it follows
writing order on every guide piece it covers (`writingPieces` cuts each guide at its corners and turns
each piece to run down or right; `followsWritingOrder`). So a square's left side goes down, never up,
and the whole square drawn clockwise in one stroke is still "W drugą stronę!". The `/` line is stored
top to bottom for the same reason. Strays outside the corridor are measured in pixels, not pointer
events (`OUTSIDE_PX` in Kształty, `OUTSIDE_SHARE` of the canvas in Szlaczki), so a 120 Hz tablet or a
stylus is not stricter than a 60 Hz finger.

### Letter artwork

`ALPHABET` is the 26 English letters, used by the letter games and (as `TRACING_ALPHABET`) the
tracing tool, in both cases. Distractors come from `letterConfusion`: shape look-alikes, plus the
mirror letters (b d p q, m w, n u, `MIRROR_PAIRS`) put first on the hardest Znajdź literę setting.
The Polish app's nine accented letters and their artwork were removed.

**q, v, x and Q, V, X are placeholders** (November 2026): Polish has none of them, so they were
built from straight lines and the existing `a` bowl / `O` until Borys's drawn exports arrive. The
lowercase three are `src/assets/letters/{q,v,x}.svg` (hand-written, like the other 23 originals);
the capitals are `letter_sources/upper/{Q,V,X}.svg`, built by `build_letters.cjs`. All six pass the
letter check. Replace them with the exports, add `UPPERCASE_FIXES` entries if a stroke runs the
wrong way, and re-run the check.

Three things about the files:

- **Capitals live in `assets/letters/upper/`.** `A.svg` and `a.svg` are the same name to Windows
  and macOS, so a flat folder would lose one of them the first time the artwork was copied
  anywhere. Lowercase keeps `assets/letters/`.
- **`data-body` and `data-band` on the `<svg>` decide the framing.** `data-body` is the y range of
  the letter body; `data-band` is where that body belongs between the ruled lines (`0.43 0.68` is
  the writing band, `0.18 0.68` the ascender and capital band). Without them `parseSVG` falls back
  to guessing from the letter's type and the height of the whole box — which fits accent *and*
  letter into the writing band together, leaving every accented letter smaller than the letter it
  is built from. The 23 original lowercase files carry neither attribute and still take the old
  path; everything `build_letters.cjs` writes carries both, measured off the artwork with exact
  cubic bounds rather than the hull of the control points, which overshoots enough to sit a letter
  off the line.

**The ruled lines sit at 18 / 43 / 68 / 93% of the canvas**, and four places have to agree on
that: the lines in `LetterCanvas`, `LOWER.band`/`UPPER.band` (and `ł`'s band) in
`build_letters.cjs`, the fallback percentages in `parseSVG`, and the fallback `viewBox` offset in
`buildLetterPaths`. The margin above the top line is wider than the one below the descender line on
purpose: a kreska over a capital rises about 14% above the top line, and at 10% it ran off the top
of the canvas. At 18% it and the tail of a `g` clear their edges by about the same 4-5%. Move all
four together, then rebuild the letters.

**Do not hand-edit anything in `assets/letters/upper/`.** `node build_letters.cjs` regenerates
all 26 capitals from `letter_sources/upper/`, the exported artwork. Re-export into that folder and
re-run it. (The notes below on marks and composing describe the Polish accented letters the script
used to build too; that code is gone.) It
exists because of three things that cannot be done by hand at this scale:

- *Direction, order and stroke splitting.* The checker compares trajectories, so a letter drawn
  bottom-up is a wrong answer; it treats one `<path>` element as one pen stroke, so a `d` holding
  three subpaths asks for one stroke where a child draws three; and although warping forgives a
  loop begun a little way round from the guide, one begun at the foot is half the loop out of step
  and still scores as badly as one drawn backwards. `UPPERCASE_FIXES`
  and `AUTHORED_LOWER` record, per letter, which subpath survives, which way round it goes, and
  whether a closed one needs re-pointing to twelve o'clock.
- *Filling the gaps.* Where there is drawn artwork it is used as drawn — the drawing wins over the
  recipe. Where there is not, the letter is composed from its base plus a mark, so a `Ć` is the
  `C` the child already learned with a kreska over it. Today only the nine accented capitals
  are composed.
- *Mark weight.* A mark has to be longer than the guide pen is thick or it renders as a blob —
  which would make `ź` and `ż` the same letter to look at. Every mark in the set lands between
  1.8× and 2.4× the pen. The kreska as exported was 0.73×, so `KRESKA_SCALE` grows it from the end
  the pen finishes on, keeping the drawn angle and position; set it to 1 for the artwork exactly
  as drawn. Note the two rules are not the same: a kreska floats and is matched to the same
  *absolute* size in both cases, while an ogonek hangs off the letter as a structural extension
  and is matched to the same *share* of it, because a curl packed into a straight line's arc
  length stops reading as a hook.

`node check_letters.cjs` reports which way every stroke runs and flags any that break the
top-to-bottom, left-to-right rule. `node preview_letters.cjs [letters] > sheet.html` draws a
contact sheet with each stroke numbered, dotted at its start and arrowed at its end — serve it
through the dev server rather than opening the file directly, or the script that draws the arrows
will not run.

Neither is a substitute for the real check, which needs a browser because sampling a path needs
`getTotalLength`. **`check_validation.js`** is that check. With the dev server up, in the console:

```js
const v = await import('/check_validation.js');
await v.run({ letters: 'abcdefghijklmnopqrstuvwxyz', trials: 8 });  // then the capitals
v.margins({ letters: 'abh' });      // raw scores: right attempts against the nearest wrong letters
v.explain('b', 'guided', 'medium', 3);
```

It does not replay the perfect trace; it puts each letter's own path through what a finger does -
wobble, proportions a little off, a loop begun round from where the guide starts it, a finger lifted
instead of retracing a stem - at four levels, seeded so two runs over the same checker agree. Run a
case at a time: the whole alphabet in one call runs past the browser pane's 45-second script limit.
What must hold, and did after the warping change: every letter passes `exact` and `light`; `medium`
is at or near 100% for all of them; and none of the three rejection counts - a letter drawn
backwards, another letter drawn well, the letter with one of its strokes left out - is above zero.
The first two numbers are what a child feels. The last three are what keep the check honest; a
change that improves pass rates by relaxing it shows up there first.

### Szlaczki (pattern families)

`data/patternsData.js` holds four families — osa, żyrafa, delfin, pająk — each a progression:
rows to practise the movement, the same movement wound into a spiral or ever bigger rings, then
one picture built out of it. Two things keep it maintainable:

- **Paths are generated or traced, never transcribed by hand.** A generated row is one relative
  segment repeated (`chain`) or evenly spaced copies of a shape (`row`), with spirals sampled from
  their parametric form; every repeat unit has a net `dy` of 0, so a row cannot drift off its line.
  The hand-drawn ones live in `data/patternArtwork.js` and reach the data file through `traced(id)`.
- **Three frames, all 100 units tall.** Rows are `0 0 300 100` (drawing in the writing band, y
  24..82), wide pictures `0 0 150 100`, square ones `0 0 100 100`. Because the height is fixed, one
  corridor width and one pen width (in viewBox units, converted in `PatternsTool`) describe every
  pattern, and the canvas and its wrapper take their aspect from the frame. `isRowPattern` — which
  picks writing lines over the helper grid — thresholds at 2, between the picture frames and the row.

`patternArtwork.js` is generated: `node fit_pattern_svgs.cjs <folder-of-svgs>` reads exported SVGs,
uniformly scales and translates each into its frame (nothing is reshaped), trims repeating rows to
a whole number of repeats at a size a finger can follow, reverses any drawn right-to-left, and
rewrites the file. Re-export and re-run it rather than editing coordinates in there.

**On a phone a row shows only its first few repeats** (`utils/patternWindow.js`, switched by
`PHONE_QUERY` in `PatternsTool`). A whole row on a 390px-wide screen was 360×120px - loops 40px
across - too small for a finger. `rowWindow` cuts it to about half its width, always on a whole
repeat: a row of separate shapes keeps the shapes that fit, a row drawn as one line is cut where the
line does what it does at the row's real end (same height, same direction), so a row of Z's stops on
a Z's bottom bar. The cut is read off the geometry, so re-exported artwork needs nothing changing
there. Everything downstream - guide, mask, start dot, animation - gets the windowed pattern;
`isRow` still comes from the full one. Tablets get the full row.

**Closed shapes start at the top and go left** (anticlockwise), in both Kształty and Szlaczki - the
builders in `patternsData.js` (`ellipse`, `square`, `diamond`) do it, `osa-osa` is reversed in
`fit_pattern_svgs.cjs`, and `pajak-pajeczyna` is plain coordinates in `patternsData.js` re-ordered to
start on the roof. Murek and Płetwy are deliberately short (seven turns, three fins) and centred;
`rowWindow` frames a row that already fits a phone tightly instead of cutting it.

The picture is drawn on a square canvas and a row on a long one, sized so each holds about the
same number of pixels — `validateUserDrawing` walks every one of them per check.

A pattern marked `progressive: true` (the four "coraz większe" ones) is a sequence, not a set:
tracing mode shows the smallest ring alone and adds the next only once that one is drawn, so the
shape grows around what the child just made. That needs the two masks in `shapeBoundary` to differ
— the corridor covers every revealed ring, so finished ones are not counted as straying, while
`targetStrokes` narrows coverage to the ring being drawn now. Without the split every new ring
would start out already complete. Animation mode still plays the whole thing, small to large.

`PatternsTool` deliberately judges more gently than the shared `TOLERANCE.guided` curve: a szlaczek
runs the width of the screen, and a hand that stays neat for three loops and wobbles on the rest has
done the exercise. Letters and shapes are untouched by this — the mask takes the tolerance as an
argument rather than the tool editing the shared one.

**Do not draw a stroke on with `pathLength="1"` plus a stylesheet `stroke-dasharray`.** Chrome does
not reliably apply a `pathLength` set at element creation to a dash length that came from CSS, and
the stroke then stays invisible for the whole animation (re-setting the attribute by hand fixes it,
which is what makes it look intermittent). Every draw-on animation uses `drawOn(timing)` from
`utils/strokeTiming.js`, which sets the dash from the measured `length` that `getStrokeTiming`
returns.

### Flashcards, countdown and repetitions

`ArrowsTool` and `NumbersTool` (Kolorowe Liczby) are twins: shared colours in `data/colors.js`, the
next card from `utils/sequence.js`. **Repeats are allowed on purpose.** Excluding the previous
direction and the previous colour turned 2x2 into a strict alternation; now a card can come up
again (at most `MAX_RUN` in a row), and every new card replays the `card-pop` animation - keyed by a
roll counter - so a repeat is visibly new. Auto-slides in both, and the metronome, share
`RunSettings` (how many before stopping, `0` = endless) and `useCountdown` + `Countdown` (3-2-1 with
`sounds.playCountdown`). The metronome's beat limit stops queuing at the limit and stops the run half
a beat after the last tick.

First Sound has a position setting: first sound, last letter, or a random letter shown in place
in the word. The last and random ones are letters, not sounds ("cheese" ends on a silent E). See **Pictures**
for which words are asked about their first sound and which answers may sit next to each other.

### Progress and rewards

`utils/progress.js` is a singleton store with `subscribe`/`getSnapshot`, read through
`hooks/useProgress.js` via `useSyncExternalStore` — no context, no provider. `getSnapshot` must
keep returning the same object identity until something actually changes, or React loops.
`totalStars` is recomputed from `stars` on load rather than trusted. The saved shape is one level
deeper than needed today so profiles can be added additively later.

Stars are earned through **`hooks/useRound.js`**, never by calling `progress.recordResult` from a
tool. A round is one item (a letter, word, shape, board, quiz card) from first try to "Brawo":
`round.miss()` on any mistake or hint, `round.win(itemId)` on success - it records
`{ success: true, clean: !missed }` once and returns `false` on every later call, so a second tap on
Sprawdź or a second Enter during the celebration does nothing - `round.after(fn, ms)` for the
"next item" pause, and `round.reset()` on a new item, which also clears its timers. Each tool used
to do this itself and the copies drifted: a repeated Sprawdź paid out three stars and skipped two
words, the arrow and number quizzes called every success clean, a "next word" timer survived ▶ or
leaving the tool. First success always earns one star, the rest are for doing it cleanly. Pary liter
counts a miss only as a memory slip - a pair whose partner had already been turned over - since the
first look at any card is luck. `StickerUnlock` is mounted once
in `App.jsx` and watches the store, so a game gets the celebration without knowing stickers exist.

**Stickers are for sticking.** The sticker book (`StickerBook.jsx`) used to be a shelf of cards a
child looked at once; now it is three pictures - meadow, sea, space (`StickerSceneArt.jsx`, plain
SVG) - and every owned sticker can be tapped onto one (it lands on the most open spot), dragged out
of the tray onto it, moved, tapped to dance, and dropped on the bin or off the picture to take it
off. Stickers are not used up, so owning more means more kinds to make pictures with. Where they
sit is `utils/stickerScene.js`, a store shaped like `progress` (`letter_app_sticker_scene_v1`),
positions as fractions of the picture so an arrangement survives a rotation; at most 40 per picture.

- **34 stickers** in `data/stickers.js`, chosen to live in those pictures and ordered so each
  picture gets something new every few. The first arrive every three or four stars - a success pays
  up to three, so at every two the announcement followed almost every success - and the announcement
  waits until the game's own success card has gone (`ANNOUNCE_DELAY_MS`). Changing the list
  is safe: `sanitise` in `progress.js` adds anything the star total already pays for on the next
  launch, silently, rather than queueing a pile of announcements for the next star.
- **How close the next sticker is** is a ring that fills (`stickerProgress`, measured from the last
  sticker's price), both at the start of the tray and round the star in the corner pill. The dash is
  set from `RING_LENGTH`, not `pathLength` - see the `PatternsTool` note in **Szlaczki**.
- **The tray scrolls one way, so only a movement the other way picks a sticker up** (sideways tray:
  up; the column tray beside the picture on a phone held sideways: sideways). Its `touch-action`
  lets the browser take the scroll, which cancels the pointer. Tested with CDP touch events: a
  vertical drag places, a horizontal pan scrolls 332px and places nothing.
- **"Przyklej!" on the unlock announcement** adds the new sticker to the current picture and opens
  the book, where it pops in (`lastAdded`, not saved).
- The sticker drawings are Noto's, like the rest of `assets/pictures/`. The 22 added for this came
  out of the `@svgmoji/noto` sprite on npm (`sprites/all.svg`, one `<svg id="1F98B">` per emoji),
  because GitHub's raw files were not reachable from the session that made them. Name a new one by
  its codepoint, lowercase, without `fe0f`.

### Offline and installing

The app was always built to run without a network — artwork bundled, sounds synthesised, no
requests at runtime — but that only pays off once the page itself survives being offline, so
`vite-plugin-pwa` (Workbox, `generateSW`) precaches the whole build: 261 entries, about 3.8 MiB.
Most of that is the 179 word illustrations (`webp`, about 15 KB each - see **Pictures**); the rest
is the JS bundle, the twelve home-screen card pictures and four Szlaczki animals (about 160 KB), the two Andika font files (24 KB), the icons and the few sticker SVGs too large
to have been inlined. The icons are palette PNGs (about 150 KB for all four); the full-colour
exports were 640 KB and doubled the first download. The letter and
pattern artwork is `?raw` or under the inline limit and already sits inside the bundle. A new file
type has to be added to `globPatterns` in `vite.config.js` or it is not precached and the app loses
it offline.

- **`registerType: 'autoUpdate'`.** The usual "a new version is available, reload?" prompt assumes
  a reader. A new build installs in the background and takes over on the next launch instead.
- **The service worker is off in dev** (`devOptions.enabled: false`), or the dev server would go on
  serving a cached build and edits would stop appearing until the cache was cleared by hand. To
  test anything about it, build and use the `letters-preview` launch config. Stopping that server
  and reloading is a true offline test — no throttling to misread.
- **`navigateFallback` is set but does nothing today**, since `App.jsx` pushes state with no URL.
  It matters only if a real path is ever introduced.

**The master icon is now `public/icon-512.png`, a raster drawn outside this repo (October 2026).**
`favicon.svg` is a separate, simpler export of the mark with no `<rect>` plate, so `build_icons.cjs`
no longer runs against it — and would overwrite `icon-512.png` with a flat rendering if it did. The
full-bleed shapes (`icon-maskable-512.png`, `apple-touch-icon.png`, the Android `ic_maskable` and
`android/store_icon.png`, the 512px Play listing icon) were cut from `icon-512.png`: cropped inside its rounded corners and bevel, the
glyph shrunk until its farthest white pixel sits at 77.5% of the radius (Android's circle mask shows
79%), and the margin filled with the crop mirrored across each edge. A full-bleed export from the
artwork's source would be better than that if the mark changes again. The two shapes:

Before the change, `node build_icons.cjs` derived all four from `public/favicon.svg` and emitted two
distinct shapes. A *maskable* icon is cropped by the launcher to a circle, squircle or teardrop, so
it is drawn full bleed with the glyph shrunk into the safe zone; an *any* icon is used as-is and
keeps the favicon's own rounded corners. One file cannot serve both — as maskable it loses its
corners, as any it floats a small square inside a circle. iOS reads neither the manifest nor SVG
touch icons and paints transparency black, so `apple-touch-icon.png` is the full-bleed shape and is
declared in `index.html` the old way, next to the `apple-mobile-web-app-*` meta tags.

The script drives Chrome over the DevTools protocol rather than using its `--screenshot` flag.
That flag takes its size from `--window-size`, which is device pixels while the page viewport is
CSS pixels — so under Windows display scaling the icon rendered at 80% and lost its bottom and
right edges — and it cannot go below Chrome's minimum window size at all, which silently produced
a blank 192px icon. `Emulation.setDeviceMetricsOverride` has neither problem.

### The Android app

`android/` is a **Capacitor 8** project (package `com.playgoo.letters`, set in `capacitor.config.json`
and `android/app/build.gradle`): a WebView with the whole web build copied inside it, served from
`https://localhost`. It replaced the Polish app's Trusted Web Activity (November 2026) because a TWA
is Chrome showing a website, and AdMob and Play Billing need native code in the app. It also means
the app needs no network and no Chrome, and nothing is deployed anywhere: **a new version of the
app is a new upload to Play**, with `versionCode` raised in `android/app/build.gradle`.

```bash
npm run build:android      # web build for Android + cap sync (copies it into android/)
node android_build.mjs     # the above, then the signed AAB and APK; creates the upload key on first run
```

- **`vite build --mode android` leaves out the service worker** (`vite.config.js`). The files are
  already on the tablet, and a worker would serve the previous version's cached build on the first
  launch after every Play update. The web build (`npm run build`) still has it.
- **The system Back button is `utils/native.js`**: with `@capacitor/app` listening, Back steps one
  screen back through the history `App.jsx` keeps (its `depth`), and only on the home grid closes
  the app. Without a listener, Back closed the app from any screen.
- **The web view sits between the system bars, not under them.** Android 15+ forces edge to edge;
  Capacitor's `SystemBars` (`insetsHandling: "native"`) pads the web view clear of the bars unless
  the page asks for `viewport-fit=cover`, so `index.html` no longer asks for it. The padding shows
  the window background, `#F8FAFC` like the page (`values/styles.xml`), and the bar icons are dark
  (`style: "LIGHT"`). If `cover` ever comes back, every `100dvh` in `index.css` has to subtract the
  insets too.
- **`android/release.jks` and `android/keystore.properties` are the upload key**, made by
  `android_build.mjs`, gitignored. With Play App Signing Google holds the key families' copies are
  signed with; this one only proves an upload came from Borys, and losing it means a reset through
  Play support. Back both up together. The script never overwrites a key.
- **The launcher icon and splash** are the TWA's renders of `icon-512.png` / `icon-maskable-512.png`
  (`mipmap-*/ic_launcher.png`, `ic_maskable.png`, `drawable-*/splash_logo.png`). The adaptive icon
  insets the maskable cut on white, the way Chrome insets a WebAPK icon. Regenerate them if the mark
  changes.
- **Generated, not committed:** `android/app/src/main/assets/public` (the web build), the
  `capacitor.*.json` files beside it, `res/xml/config.xml` and `capacitor-cordova-android-plugins/` -
  `cap sync` writes them and `android/.gitignore` skips them, so a fresh checkout needs
  `npm run build:android` before Android Studio can build it. `capacitor.build.gradle` and
  `capacitor.settings.gradle` are also written by `cap sync` but are committed, as Capacitor expects.
- **CI builds a debug APK** on pull requests that touch the Android side (`.github/workflows/android.yml`)
  and keeps it as a downloadable artifact for 14 days - the quickest way to try a change on a tablet.
- **JDK 21 to 24.** Capacitor 8 compiles for Java 21 and Gradle 8.14 does not run on 25.

### Ads

The Android app shows AdMob ads; the web build shows none. Everything is in `utils/ads.js`, driven
by one call: `App.jsx` passes every change of `view` to `onScreen`. Borys's rules (November 2026):

- **A banner on the three menus only** (`tools`, `letters-menu`, `patterns-menu`), at the bottom,
  hidden the moment an activity opens. It is a native view laid over the web page, so the page pads
  `body` by `--ad-banner-height`, which `ads.js` sets from the banner's reported size and keeps at 0
  whenever no banner shows (offline, no fill, an activity). A resumed banner does not report its size
  again, so the last height is remembered. The menus scroll; activity screens never get the padding.
- **Full-screen ads only on the way back to the home grid from an activity** - not menu to menu - at
  most one every 4 minutes (`INTERSTITIAL_GAP_MS`) and none in the first 2 (`FIRST_INTERSTITIAL_MS`).
  The next one is loaded in the background as soon as one closes.
- **Child-directed on every request**: `tagForChildDirectedTreatment`, `tagForUnderAgeOfConsent`,
  `maxAdContentRating: General`, `npa: true`, and the `AD_ID` permission removed in
  `AndroidManifest.xml`. This is the Google Play Families policy. There is no consent form: Google's
  consent tools are not shown to a child-directed app. In AdMob itself the app must also be marked
  as directed at children and use only Families-certified mediation partners.
- **Test ads until the ids are set.** The ids live in `.env` (`.env.example` has the shape):
  `ADMOB_APP_ID` (read by `android/app/build.gradle` into the manifest) and `VITE_ADMOB_BANNER_ID` /
  `VITE_ADMOB_INTERSTITIAL_ID` (read by the web build). Without them the app asks for Google's test
  units, which is what CI builds get, and `android_build.mjs` refuses to make a release. Never tap
  real ads on your own device while testing: AdMob suspends accounts for it.
- **`disableAds()`** is for the "Remove ads" purchase: no banner, no full-screen ad, from then on.
- The plugin is `@capacitor-community/admob`, pinned to an exact version.

### The "Remove ads" purchase and the grown-ups' gate

One Google Play in-app product, **`remove_ads`** (non-consumable; created and priced in Play Console,
about £5.99/€5.99), bought from the "For grown-ups" panel. `utils/purchase.js` is a store shaped like
`progress`, read through `hooks/usePurchase.js`; the plugin is `cordova-plugin-purchase` (pinned),
which Capacitor loads as a Cordova plugin, so it starts on `deviceready` and only in the Android app.

- **Owning it calls `disableAds()`** and is remembered in `letter_app_ads_removed`, so a family that
  paid sees no ad at launch, offline included (`main.jsx` imports the store before the first render).
  Play stays the authority: once it has answered (`receiptsReady`) and the product is not owned - a
  refund - the flag is cleared.
- **Purchases are acknowledged at once** (`transaction.finish()` on `approved`); Play refunds one left
  unacknowledged for three days. There is no receipt server: the purchase is a switch on the tablet,
  and Play reports it again on any device signed in to the same account ("Restore purchase" asks now).
- **The section shows only when Play has loaded the product, or it is owned**, so the web build and a
  tablet without Play show nothing to buy. The price is Play's, in the buyer's currency.
- **Everything behind "For grown-ups" is behind `ParentGate`**: a multiplication written in words
  ("seven times six") with a number box. Google Play's Families policy wants a gate before purchases
  and links out of the app, and the panel has both. A pre-reader cannot read the question; a wrong
  answer gets a new one.

### Windows PCs and classroom boards

*This section describes the Polish app. The English edition ships on Android only and its web
build is not deployed anywhere, so none of this is in use - but the code is still there.*

On Windows the app is the installed PWA, for the same reason the Polish Android app was a TWA and
not a bundled build: the licence lives on the site's origin and storage, and an Electron/Tauri copy would run on
its own origin (refused by `ALLOWED_ORIGIN`) with its own storage (a second licence slot). Edge and
Chrome install it into its own window and Start menu entry, sharing the browser profile's storage,
so a board activated in the browser stays activated once installed. School IT can push it to every
PC with the `WebAppInstallForceList` policy (Edge and Chrome both have it).

- **`utils/install.js`** is a store shaped like `progress` and `license`, read through
  `hooks/useInstall.js`. It captures `beforeinstallprompt` - fired once, early, so `main.jsx` imports
  the module before the first render - and suppresses the browser's own infobar. The install button
  is shown on the activation screen and, as "Zainstaluj", on the home screen only, because it is for
  the adult. It appears only while the browser is offering, so never inside the installed app,
  never on iOS, and never in the Android app.
- **The fullscreen button** shows on board-sized screens or with a mouse
  (`(min-width: 1400px), (hover: hover) and (pointer: fine)`), not on tablets, where it would only be
  something for a child to hit by mistake. The manifest stays `standalone` for the same reason as
  before; `launch_handler: focus-existing` makes a second click on the desktop icon bring the open
  window forward instead of opening another.
- **Drawing goes through `hooks/usePointerStroke.js`** in `LetterCanvas`, `ShapesTool` and
  `PatternsTool` - Pointer Events, not touch and mouse handlers. The old pair recorded a tap as two
  strokes (touch, then the emulated mouse events), let a second hand on the board end the first
  child's stroke when it lifted (losing the rest of it), drew a dot on right click, and reached a
  board pen only through emulated mouse events. Measured with CDP-dispatched touch and pen input:
  tap `[1, 1]` -> `[1]`; a stroke with a second hand landing and lifting midway `[6]` + a new stroke
  -> one stroke `[10]`. Whichever pointer starts a stroke owns it; others are ignored until it lifts.
  Coalesced events are deliberately not used: the "N consecutive points outside" corridor checks in
  Shapes and Patterns count events, and more of them would trip the limit sooner.
- **Big screens** get their own block in `index.css` (`min-width: 1200px` and `min-height: 900px`),
  above the landscape-phone block. It only lifts the tablet caps (canvas 540px, column 680px), so a
  1920x1080 board draws at 768px and still yields to `--stage-chrome`. A 4K board at 100% Windows
  scaling should be zoomed (Ctrl and +, remembered per site) rather than given more CSS: zoom scales
  every control, a breakpoint would only scale the canvas.

### No licence, no deploy

The Polish app locked itself behind activation codes checked by a Cloudflare Worker, and every push
to `master` deployed to the Polish site. Both were removed from this repository on purpose: the
English edition is free (ads plus a Play purchase), and nothing here may ever deploy to the Polish
addresses (`naukaliterek.pages.dev`, `literki.acentrum.pl`). Do not bring back a `deploy.yml`
pointing at them. Some notes above still mention the licence as the reason for a design choice
(origins, the Windows PWA); those reasons no longer apply here.

### Pictures

**One word bank, `data/wordsData.js`, feeds all four picture games** - Word Scramble, Syllables,
First Sound and the picture mode of Letter Pairs. A word is one row, `w('GI-RAFFE', 'animals',
'amber', 'clue')`: the syllables spell the word, and everything else (`id`, `name`, `length`,
`firstSound`, `digraph`, colours) is derived. `syllablesData.js` is just the rows with two
syllables or more. The file imports nothing, because `build_pictures.cjs` loads it with Node.

- **Each word has an illustration in `src/assets/pictures/words/`, found by the word's `id`** - its
  spelling in lower case (TORTOISE -> `tortoise.webp`). `<Picture word={word.id} />` shows it. The
  illustrations are white discs with transparent corners, so they fill a round frame edge to edge
  rather than sitting inside one.
- **The pictures came from the Polish app and were renamed to their English word** (November 2026).
  179 of its 197 were kept. The 18 dropped ones needed two words in English (ice cream, fishing rod,
  watering can, pencil case, Christmas tree), were words a pre-reader will not know (set square,
  vice, rowan), were pictures of people that have dated badly (the Eskimo and Indian), or were the
  Polish flag. Several were renamed to what is drawn rather
  than translated word for word: `euro` is COIN, `ul` BEEHIVE, `list` ENVELOPE, `osemka` EIGHT.
  **No word starts with Q or X, and I, K, O, U, Y and Z have one word each**; new pictures for those
  letters (queen, quilt, van, yo-yo, kite, octopus...) are waiting on artwork.
- **`node build_pictures.cjs <folder-of-pngs>` makes them.** The originals are 822px PNGs named
  after the word, not in the repository; the script scales them to 400px WebP (twice the largest
  frame, about 15 KB each) by driving Chrome like `build_icons.cjs`, so it needs no image library.
  Spaces, hyphens and capitals in a file name are dropped ("Deck chair.png" -> `deckchair`). It ends
  by listing any picture without a word and any word without a picture, and fails if there are any.
  Do not hand-edit the WebP files.
- **The word names exactly what is drawn, including how many** - two boots are BOOTS. Look at the
  picture before adding a word.
- **Syllables** are clapped the way Reception teaches: a double consonant is split (HAM-MOCK,
  BAL-LOON) and so is a pair in the middle of a word (WIN-DOW), unless the two make one sound
  (DOL-PHIN, FEATH-ER). The syllables must spell the word exactly.

**First sounds are judged by sound, and where sound and spelling disagree the word is not asked.**
`firstSound` is the sound as written: a digraph for CH, SH and TH (held back for the hard level;
WH counts as W), and `null` for the words in `NO_FIRST_SOUND` - a soft C or G (CIRCUS, GIRAFFE,
GENIE, GINGER), PH (PHONE), and vowels that are not their short sound (EIGHT, EYES, ONION, ACORNS,
APRON, UFO, ARMCHAIR, ACCORDION, ELECTRICIAN). Marking the letter right would teach the wrong sound
and marking the sound right contradicts the spelling, so those words are left out of first-sound
rounds and still appear wherever the question is about letters. A new word whose first sound is
not its first letter's phonics sound goes into that set. `soundsClash` keeps two answers apart when
they are the same sound spelt differently (C and K) or start with the same letter (S and SH): K is
never offered against CAT, and a KETTLE is never a wrong picture for C.

**The right answer must not be the odd tile out.** Drawn from single letters alone, the answer for
SHARK was the only two-letter tile, so a child could win without hearing anything.
`letterDistractors` in First Sound gives a digraph answer other digraphs, and on the hardest setting
a single-letter answer now and then gets one too. Below the hardest level a letter and the digraph
that starts with it (S and SH) are never side by side.

**`HARD_WORDS` wait for the hardest setting** of First Sound, sit out Letter Pairs and come last in
Word Scramble and Syllables: words a pre-reader may not know (COMPASSES, BOLT, FLOUR) and pictures
likely to be named as something else (a hare is "a rabbit", a foal "a horse", a bison "a cow").
**`PICTURE_GROUPS`** are pictures a child can take for each other (HORSE, RIDER, FOAL, JOCKEY;
BUTTERFLY and MOTH; DEER and MOOSE; BOAT and YACHT...); `picturesClash` keeps them out of the same
round. Add to both when a new picture is ambiguous.

**Word Scramble and Syllables step through words easiest first, shuffled inside each difficulty**
(`shuffledByTier`) - by length in Word Scramble, by syllable count and then open syllables in Syllables - in a
new order each time the game is opened. In file order a child met the same first word every time.

**Picture frames are sized from the height the screen has left**, like the canvases: `--pic` on
`.scramble-illustration-circle`, `.sound-prompt-picture` and `.sound-options` is `100dvh` minus
everything else on the screen with the longest word showing. It does not depend on the word, so the
picture stays one size from word to word. Re-measure the subtracted number when a row is added.
Words now run to eleven letters: the answer slots narrow to stay on one row (`--slots`), the letter
tiles keep their size and wrap. A phone on its side puts the picture on the left of the card.

`utils/pictures.js` + `components/Picture.jsx` also still serve the older set: `<Picture emoji>`
swaps in a bundled Noto SVG from `src/assets/pictures/`, keyed by codepoint (the `FE0F` variation
selector is stripped, or half the symbols never match), and falls back to the emoji glyph when no
SVG is shipped. Only the stickers use it now.

Noto Emoji is OFL/Apache — attribution belongs in a README if this is ever published.

## Conventions worth knowing

- **`index.css` responsive rules must go at the very end of the file.** CSS breaks ties by source
  order, so a `max-width`/`max-height` override placed above the rule it overrides silently loses.
  This has bitten twice. There is a comment marking the footer block; keep new breakpoint rules
  below every base rule, loosest breakpoint first.
- **`--stage-chrome`** is the measured height of everything stacked around a drawing canvas.
  `.canvas-wrapper` subtracts it from `100dvh` so the Sprawdź button never falls below the fold.
  Per-tool overrides use `:has()`. When a tool gains or loses a row, re-measure it in the browser
  rather than guessing.
- Every `localStorage` touch is wrapped in `try/catch` (private mode, quota, blocked site data) —
  tools go through `utils/storage.js` (`loadSetting`/`saveSetting` for JSON, `loadChoice`/`saveChoice`
  for the bare strings the older keys hold). One unwrapped read in Słowa once blanked the whole app.
  Per-tool settings use `letter_app_*` keys, and every setting a tool offers is remembered.
- **Every screen sits inside `ErrorBoundary`** (keyed by view, in `App.jsx`), so a crash in one
  activity shows a picture and a button back to the grid instead of a blank page.
- **Settings panels are `<SettingsModal>`** and answer cards are `<FeedbackModal>`. Both are real
  dialogs through `hooks/useDialog.js`: focus moves in and comes back, Tab stays inside, Esc closes,
  and no key reaches the tool behind (a tool's Enter or arrow shortcuts used to fire under an open
  panel). A card with no buttons is `role="status"` and goes away by itself; one with `actions` is an
  `alertdialog`. Do not hand-write another overlay.
- `utils/random.js` has `shuffle` and `randomFrom`; there were eight private copies.
- All audio routes through `sounds` in `utils/audio.js`, so one mute button silences everything.
  Sounds are synthesised with Web Audio — no audio files.
- `MetronomeTool` queues its ticks ahead on the audio clock (`sounds.playTick(perfTime)`) from a 25ms
  timer, rather than playing each one when a timer fires, which would drift with every busy frame.
  **It hands over each beat's own `performance.now()` moment, never a delay from now.** A delay is
  measured against `ctx.currentTime`, which only moves when the sound hardware takes its next block -
  10ms on a desktop but 21ms or more on a phone - so every tick landed somewhere else inside that
  block and the beat limped on phones and iPads while sounding perfect on a PC. `sounds.syncClock()`
  tracks the gap between the two clocks instead of reading it afresh per tick: `currentTime` can only
  lag, so the highest reading is the truest, and the estimate sinks half a millisecond a second to
  follow the clocks drifting apart. It is sampled from the scheduler *and* every animation frame,
  because it needs several readings to settle before the first tick. Simulating a phone's block size
  (patch `ctx.currentTime` to `Math.floor(t / (1024/48000)) * (1024/48000)`) is how this was caught:
  23ms of spread before, 2ms after. A tempo change starts at the first beat not queued yet, so a tick
  already on its way is not cut short.
  The swing is drawn from the same beat count in `requestAnimationFrame`, written straight to the
  SVG through refs rather than state, so sound and arm agree without re-rendering 60 times a second.
  The arm moves at constant speed and turns on the tick; the cosine easing it first had parked it at
  each end for a fifth of every beat, which read as a pause and made the beat look late. The drawing
  also runs `sounds.outputDelayMs()` behind, so the arm turns when the tick is heard, not queued.
  Measured on a desktop: ticks land within ±1ms of the grid, so the audio scheduling was not the fault.
- Timers go through `round.after` (or a `timersRef` cleared on unmount where there is no round);
  several bugs here came from a stale timer wiping a drawing the child had already restarted.
- **Hands-free runs keep the screen awake** with `hooks/useWakeLock.js` (Metronom, auto-slides in
  Strzałki and Liczby), or the tablet dims and locks mid-run while the child draws on paper.
- **Letters a child reads are drawn in Andika** (`--font-letters`, bundled in `src/assets/fonts/`,
  SIL OFL): a single-storey a and g like the tracing guides, and an I, l and 1 that differ. Without
  it every device drew its own system font. Only the Latin subset ships; the Polish cut was removed.
- **Colour as text needs the dark shade.** `data/colors.js` gives each colour a `text` for titles
  and labels (the bright `color` is for fills a child names; yellow on cream is about 2:1), Kolorowe
  liczby edges its digits in it, and `FeedbackModal` darkens its title colour to 4.5:1 by itself.
- React Compiler is on (`babel-plugin-react-compiler`). Its ESLint rules are set to `warn`, not
  `error`, but lint is now clean (November 2026), so keep it that way. State that starts over when a
  word, pattern or tab changes is reset while rendering, keyed on what changed (`dealtFor`,
  `sheetFor`), not from an effect; effects reset only what lives outside React (canvas pixels, refs,
  `round.reset()`).
- **Every screen but the home grid is lazy-loaded** (`lazy` in `App.jsx`, one `Suspense` inside the
  `ErrorBoundary`). The precache still holds every chunk, so this changes the first paint, not offline.
- **Tablets on their side share the phone-sideways layout idea**: a canvas tool puts the canvas on the
  left at full height and the rest in a column beside it, and Słowa and Sylaby put the picture beside
  the word (`(orientation: landscape) and (min-width: 1000px) and (min-height: 560px)` in `index.css`).
  On a phone held upright the content under the header is centred in the height left. Znajdź literę
  and Pary liter size their boards in CSS from `--grid-rows`, `--grid-cols` and `--grid-chrome`.
- **The home grid shows drawn pictures, not emoji** (Borys, November 2026: "dont use emotes anymore").
  They are `src/assets/menu-icons/*.webp`, 256px, made from Borys's 278px PNG exports (`ico_<name>.png`);
  the star in the corner pill is the same `wyniki` star as the Moje naklejki card. The four Szlaczki
  families lead with drawn animals too (`src/assets/family-icons/`, `FAMILY_ICONS` in
  `data/familyIcons.js`, also the badge in the pattern screen's header). `img.tool-card-icon` is sized in
  `em`, so the breakpoints that set the icon's `font-size` still scale it, and its negative margin keeps
  the card as tall as it was with an emoji. The pattern chips inside a family (🧱, 🥛...) are still emoji.
- **The home grid is five across** from 760px, so the five Ćwicz rękę cards share a row; below 680px of
  height the heading and card subtitles step aside so all twelve cards fit a 1024x600 tablet. The
  privacy policy and "Wyzeruj postępy" (asks twice) are behind "Dla rodzica" at the bottom.
- Esc steps back a screen from anywhere (`App.jsx`), and a reload inside a tool reopens that tool.
- Layout targets tablets: verify at 1280×800, 1024×600 and 390×844. Tap targets are 44px.
- **Nothing on an activity screen should move because of something the child did.** Things that
  change with the mode or the answer reserve their space instead of appearing: `ButtonSwap` renders
  every mode's buttons into one grid cell and shows only the active set, so ◀ ▶ never slide; the
  answer banner in Sylaby and Słowa replaces the instruction line instead of growing the card; the
  quiz toast in Strzałki and Liczby has a fixed slot; the dot grid reserves rows for the largest
  number that can come up. There is no global home button (every header has its own back arrow),
  no pen-colour row, no shuffle or clear buttons beside ◀ ▶, and no counts on the settings gear.
  Before adding a control a child sees, ask whether a pre-reader needs it; settings for the adult go
  behind the gear.
- **A phone on its side gets its own layout** - the last block in `index.css`,
  `(orientation: landscape) and (max-height: 540px)`. Stacked, the drawing canvas came out 78px
  tall at 844×390. There the stars and mute pair moves down the left-hand strip, and a
  screen with one big element (canvas, `.sound-prompt`, `.scramble-play-card`, `.metronome-face`)
  puts it on the left at full height, everything else in a centred column beside it. A new tool
  with a hero element joins that `:is()` list. Verify at 844×390 and 740×360 - nothing should
  scroll on an activity screen; the menus may.
