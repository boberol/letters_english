# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The app

"PlayGoo" (formerly "Nauka Liter") — a Polish handwriting/literacy app for pre-readers. All UI text is Polish;
`index.html` sets `lang="pl"`. Design constraints that drive
most decisions here: the user cannot read a sentence, taps with a whole finger on a tablet, and
may be offline. So: pictures before words, no landing page in front of the activity grid, no
network requests at runtime (sounds are synthesised, artwork and the letter font are bundled).

**There is no voice, on purpose** (removed September 2026; Borys confirmed in November: "no voice,
pictures only"). Do not add speech synthesis or recorded clips. Anything a child must be told is
shown instead - see **Feedback a pre-reader can follow** below.

## Commands

```bash
npm run dev      # Vite dev server on :5173
npm run build    # production build to dist/ - refuses without a usable licence config in .env
npm run lint     # eslint (0 errors and 0 warnings expected)
npm run preview  # serve the built output
```

There is **no test framework** — no `npm test`, no runner installed. Verification is done by
running the app and exercising it in the browser. **Every pull request runs `.github/workflows/check.yml`**:
lint, a test build, and `node check_letters_browser.cjs`, which runs the letter-check harness
(`check_validation.js`) in headless Chromium against its own dev server and fails if any letter stops
passing `exact`/`light`, `medium` drops below 95%, or anything backwards, wrong or incomplete is
accepted. It takes about 30 seconds and runs locally the same way. Prefer the Browser pane (`preview_start` with
`{name: "letters-dev"}`, configured in `.claude/launch.json`) over `npm run dev` in a shell.
`{name: "letters-preview"}` serves the built output instead, which is the only way to exercise the
service worker — it is switched off in dev (see **Offline and installing**). Without a real licence
configuration in `.env`, build for it with `ALLOW_TEST_BUILD=1 npm run build` (see **Licensing and
activation**).

`fix_svgs.cjs`, `fix_y.cjs`, `build_letters.cjs`, `build_icons.cjs`, `preview_letters.cjs` and
`check_letters.cjs` are Node scripts used to build and check the letter SVGs. They are ESLint-ignored and are not part
of the build. See **Letter artwork** below. `check_validation.js` is their browser-side partner: it
measures how the letter check treats realistic finger drawings, and is imported into the dev
server's console rather than run with Node (see the end of **Letter artwork**).

`build_pictures.cjs <folder-of-pngs>` turns exported word pictures into the WebP files the picture
games bundle, and checks them against the word list. Also ESLint-ignored. See **Pictures**.

`license_setup.mjs`, `license_keys.mjs`, `license_codes.mjs`, `license_admin.mjs` and
`license_check.mjs` are the operator side of the activation system - set the keys and admin token on
the Worker and prove them end to end, print a keypair without touching anything, mint a batch of
codes, run the support desk, and check the licence server end to end. Also ESLint-ignored, also not
part of the build. See **Licensing and activation** and **The licence server**. `license_check.mjs` is the nearest thing in this repo to a test suite,
and unlike the letter checks it needs no browser: `cd worker && npx wrangler dev --port 8788` in one
terminal, `node license_check.mjs` in another.

`android_build.mjs` builds the Android app out of `android/`, a Gradle project that is *not* part of
the Vite build and needs a JDK and the Android SDK rather than anything in `node_modules`. Also
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

Two alphabets, deliberately. `ALPHABET` is the 23 base letters and is what the letter *games*
draw from — their distractors come from `letterConfusion`, which brings the accented look-alikes
in only on the hardest setting, because telling `a` from `ą` is its own skill. `TRACING_ALPHABET`
is all 32 Polish letters and is what the tracing tool offers, in both cases.

Three things about the files:

- **Capitals live in `assets/letters/upper/`.** `A.svg` and `a.svg` are the same name to Windows
  and macOS, so a flat folder would lose one of them the first time the artwork was copied
  anywhere. Lowercase keeps `assets/letters/`.
- **File names are ASCII** — `ą` is `a-ogonek.svg`, `ż` is `z-dot.svg` (`ASSET_SLUGS`). A name
  carrying the letter itself has to survive the filesystem, the bundler's glob and the string
  `buildLetterPaths` concatenates to look it up, and those three do not agree on how to normalise
  a Polish character.
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

**Do not hand-edit anything in `assets/letters/upper/`, or the nine accented lowercase files.**
`node build_letters.cjs` regenerates all 41 of them from `letter_sources/`, which holds the
exported artwork: `letter_sources/upper/` the 32 capitals, `letter_sources/lower/` the nine
Polish lowercase letters that were drawn by hand. Re-export into those folders and re-run it. It
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
await v.run({ letters: 'aąbcćdeęfghijklłmnńoóprsśtuwyzźż', trials: 8 });  // then the capitals
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

Pierwsza głoska has a position setting: first sound, last letter, or a random letter shown in place
in the word. The last and random ones are letters, not sounds ("chleb" ends on B). See **Pictures**
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
`vite-plugin-pwa` (Workbox, `generateSW`) precaches the whole build: 280 entries, about 4.1 MiB.
Most of that is the 197 word illustrations (`webp`, about 15 KB each - see **Pictures**); the rest
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
`store_icon.png`) were cut from `icon-512.png`: cropped inside its rounded corners and bevel, the
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

`android/` is a **Trusted Web Activity**: an Android shell with no web code in it that opens
`https://literki.acentrum.pl` (package `playgoo.acentrum`) full screen through the tablet's Chrome. It is about 1 MB and holds
an icon, a splash screen and the address. Everything else - the app, the service worker, the
offline cache - is the installed PWA, running in Chrome without Chrome's toolbar.

**That it is not a WebView with the build copied into it is deliberate**, and the reason is the
licence. A bundled build would run on its own origin (`https://localhost` under Capacitor), which
`ALLOWED_ORIGIN` refuses, and its storage would be separate from Chrome's, so a family that had
already activated in the browser would spend a second slot on the same tablet. A TWA is the same
origin and the same storage: a tablet activated in Chrome is already activated in the app. It also
means the shell almost never needs rebuilding - a push to `master` updates the app on every tablet
the way it always did, and a new APK is only for changing the icon, the name or the address.

```bash
node android_build.mjs     # creates the release key on first run, builds, verifies
```

What makes Chrome hide the address bar is a claim made in both directions: the APK names the site,
and the site names the certificate the APK is signed with, in `public/.well-known/assetlinks.json`.
Three things therefore have to come from one key - the keystore, the fingerprint in that file, and
the copy of the file the live site is serving - and `android_build.mjs` makes the first two in one
run and checks the third, the same shape as `license_setup.mjs`. It ends with "Everything matches"
or "NOT LIVE YET". **A mismatch is not an error anywhere**: the app installs, opens and works, with
a browser address bar across the top. Chrome also caches the verdict, so after fixing it, clear
Chrome's storage for the site or reinstall before concluding it is still broken.

- **`android/release.jks` and `android/keystore.properties` are the app's identity, and the only
  copy.** Android refuses an update signed by any other key, so without them a new version of the
  shell means every family uninstalling and reinstalling. Both are gitignored; back them up
  together, outside the repository. The script never overwrites a key - a keystore whose
  properties file is missing stops it.
- **`assetlinks.json` is not generated on every build, it is merged.** On Google Play there are two
  certificates: this one signs what is uploaded, Google's signs what families download. Play
  Console shows the second (Setup > App signing); add it with
  `node android_build.mjs --add-fingerprint AA:BB:...`. Rewriting the file from the local key alone
  would put the address bar back for everyone who installed from the store.
- **The Gradle project is the source, not a generated artefact.** It was produced once by
  Bubblewrap 1.25.0's generator and is edited by hand since; there is no `twa-manifest.json` and
  `bubblewrap update` would overwrite the signing block. Name, colours, host and package id are the
  `twaManifest` map at the top of `android/app/build.gradle`, and `android_build.mjs` reads the
  host and package from there. The launcher icons and splash under `app/src/main/res/` were
  rendered from the live site's `icon-512.png` and `icon-maskable-512.png`; if the mark changes,
  they need regenerating, not just `build_icons.cjs`.
- **`versionCode` must go up for every APK or bundle that replaces an installed one.** It is in
  `android/app/build.gradle`, and Play rejects an upload that reuses one.
- **The host is baked into the APK.** Moving to `naukaliterek.pl` means changing `hostName`,
  serving `assetlinks.json` from the new domain and shipping a new APK - one more reason the domain
  has to be settled before selling (see **The licence server**).
- **The site-settings shortcut is switched off** (`enableSiteSettingsShortcut`). It puts "clear
  data" one long-press away from the launcher icon, and that data is the licence and the stars.
- **Notifications are off**, so the app asks for no permission at all.
- **Gradle 8.11.1 runs on JDK 17-23.** The script takes `JAVA_HOME` and ignores whatever `java` is
  on `PATH`; Android Studio's bundled runtime (25) is too new for it.

What a TWA cannot do: run without a browser that supports it. On a tablet with no Chrome (or
Chrome disabled) it falls back to whatever browser handles Custom Tabs, with that browser's own
storage - so a different licence slot - and with an address bar. The first launch also needs a
network, since nothing is in the APK; that costs nothing here, because activation needs one too.

### Windows PCs and classroom boards

On Windows the app is the installed PWA, for the same reason Android is a TWA and not a bundled
build: the licence lives on the site's origin and storage, and an Electron/Tauri copy would run on
its own origin (refused by `ALLOWED_ORIGIN`) with its own storage (a second licence slot). Edge and
Chrome install it into its own window and Start menu entry, sharing the browser profile's storage,
so a board activated in the browser stays activated once installed. School IT can push it to every
PC with the `WebAppInstallForceList` policy (Edge and Chrome both have it).

- **`utils/install.js`** is a store shaped like `progress` and `license`, read through
  `hooks/useInstall.js`. It captures `beforeinstallprompt` - fired once, early, so `main.jsx` imports
  the module before the first render - and suppresses the browser's own infobar. The install button
  is shown on the activation screen and, as "Zainstaluj", on the home screen only, because it is for
  the adult. It appears only while the browser is offering, so never inside the installed app,
  never on iOS, and never in the Android TWA.
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

### Licensing and activation

The app is locked from the very first launch: `App.jsx` renders `ActivationScreen` instead of the
tool grid until a licence verifies. That screen is the one place here written for an adult, and the
one deliberate exception to "no landing page in front of the activity grid" - it is seen once, by
the parent setting the tablet up, before the child is handed it.

**Activation is online; use is not.** Redeeming a code is one POST, once. What comes back is a token
signed by a key the app does not hold, and every launch after that verifies the signature locally -
a tablet that never sees the network again keeps working. That single round trip is also the only
thing that makes the two-device limit real: a purely local check cannot know a code was already used
on somebody else's tablet, because it has nobody to ask. This is why the offline story in **Offline
and installing** survives intact - the precached build still runs with no network, it just had to be
let in once.

Read these three together:

- **`utils/licenseCode.js`** - the shape of the code a parent types, and nothing else. Crockford
  Base32 (no I, L, O or U) because a code is read off a card and typed on a tablet, so the alphabet
  must not hold two characters that look alike; `normaliseCode` then *folds* the substitutions
  people actually make rather than rejecting them, so `7k4m 92xq b3tp` and `7K4M-92XQ-B3TP` are one
  code. Eleven random characters plus a weighted check character: 55 bits, and the check character
  catches a typo before it costs a round trip. Imported by the batch generator too, so a code minted
  on your machine and a code typed on a tablet are judged by the same rules. **The Worker keeps its
  own copy of `normaliseCode` on purpose** - it must not take a patched client's word for what the
  canonical form of a code is.
- **`utils/license.js`** - a singleton store shaped exactly like `progress`: subscribe/getSnapshot,
  read through `hooks/useLicense.js`, every localStorage touch wrapped. `status` is
  `checking | locked | unlocked | unconfigured`. ECDSA P-256 rather than Ed25519: same 64-byte
  signature, but P-256 has been in WebCrypto for a decade and the target is whatever Android tablet
  a family already owns.
- **`components/ActivationScreen.jsx`** - one Polish sentence per failure, and each says what to do
  next, because a code that will not activate is a support email. **Adding an error reason to the
  Worker means adding its sentence here**, or the parent gets the generic fallback.

Things that are the way they are for a reason:

- **A build with no key locks rather than trusting storage.** Failing open would mean one missing
  environment variable silently ships the app unlocked and nobody notices until it has shipped.
  `VITE_LICENSE_DEV_BYPASS` skips the gate in `npm run dev` and cannot do anything in a build: it is
  ANDed with `import.meta.env.DEV`, which Vite replaces with a literal `false` in `vite build` and
  then drops the branch. Verified by grepping `dist/` - the flag does not appear.
- **And `vite build` refuses to produce that build in the first place.** Locking at runtime is the
  right failure, but a customer's tablet is the wrong place to discover it: an unconfigured build
  installs, precaches, and then accepts no code. `checkLicenceConfig` in `vite.config.js` fails the
  build when `VITE_ACTIVATION_URL` or `VITE_LICENSE_PUBLIC_KEY` is missing; when the URL is still the
  `.env.example` placeholder, points at this machine, or is not https (a page served over https
  cannot call http, so every activation would read as offline); and when the key does not import
  as P-256 SPKI - the same import the app does at launch. `ALLOW_TEST_BUILD=1` downgrades the
  refusal to a warning for builds that are not for customers; it is not `VITE_`-prefixed, so it
  never reaches the bundle. The placeholder test is case-insensitive because `new URL` lowercases
  hostnames - matching `YOUR-SUBDOMAIN` as typed silently never fired.
- **The device id is a random UUID, not a fingerprint.** A browser has no stable hardware id, and
  the fingerprints people build are unreliable and a privacy problem on a child's device. The cost
  is that clearing site data loses it, which is why the server re-issues to a device it has already
  seen without spending a slot, and why there is a reset endpoint for a tablet that is genuinely
  replaced.
- **The token is bound to that device id and checked on every launch.** Without that, copying one
  localStorage value between tablets would defeat the whole thing.
- **Enter is handled explicitly on the code input.** The form's implicit submission does not fire
  for it, and the Go key on a tablet keyboard is what a parent reaches for after the last character.
  Tested both ways before it was left in.
- **`offline` means the request got no answer; `server-error` means it got a bad one.** A fetch
  that throws - no network, the 15-second timeout, or a CORS refusal, which a page cannot tell
  apart from being offline - is `offline`. A server that answered with a body that is not JSON (a
  Cloudflare error page, a proxy, a wrong endpoint) is `server-error`. They used to share one
  branch, which told a parent to check their internet when the fault was the server's. The CORS
  case matters on deploy: an `ALLOWED_ORIGIN` that does not exactly match the app's origin makes
  every activation look like the parent is offline.
- **A licence runs for a year from the code's first activation, on any device.** Not from minting:
  a code can wait in a drawer for months. `codes.valid_days` (default 365, NULL perpetual) is counted
  from `codes.first_used_at`, which the Worker sets once - after a slot is held, so a refused attempt
  starts nobody's year, and with an `IS NULL` guard read back afterwards, so two devices activating a
  new code at the same moment agree on one value. A support reset deletes activations and leaves
  `first_used_at` alone: a new tablet is not a new year. An expired code is refused *before* a slot
  is claimed. Every device on a code gets the same `exp` in its token, however late it joins, and
  `iat` is the server's clock. A fixed `expires_at` can still be set at minting; the earlier end wins.
- **The end date is checked against the tablet's own clock, and that is deliberate.** A tablet with
  its date wound back keeps a licence past its end. Guarding against that means distrusting the clock
  in the other direction too, and a cheap tablet whose clock jumps forward once would then lock a
  paying family out for good - the worse failure. Two things soften the clock problem instead. A
  stored token that has run out is kept, not deleted, and shown as `licence-expired` with its own
  title ("Licencja wygasła") rather than the first-run greeting, so a tablet whose date was merely
  wrong unlocks again once it is corrected. And at activation, a token the device already calls
  expired while its clock is more than a day away from `iat` is reported as `clock-wrong` - "fix the
  date" - instead of telling a parent their brand-new code has run out.
- **Databases created before licences had a length need `worker/migrate-001-licence-duration.sql`**,
  once, before deploying the Worker that reads the new columns. `schema.sql` only creates tables that
  do not exist, so it cannot add them. The migration gives every existing code 365 days and backfills
  `first_used_at` from its earliest activation, so a code already in use does not get a fresh year on
  its next redemption. A second run stops at "duplicate column name" and changes nothing. Tokens
  issued before the change carry `exp: null` and stay perpetual on the devices that hold them.

What this does **not** do, and cannot: stop somebody who edits the bundle. The check runs on the
user's device, so it is patchable by anyone willing to read the JavaScript, and the build is
precached and copyable regardless. It raises the bar to "a code cannot be forged and cannot be
passed around", which is the part that costs sales. Relatedly, disabling a code stops it being
*redeemed* on anything new but does not revoke tokens already on tablets - those are verified
offline against a signature, and nothing reaches back to them.

### The licence server

`worker/` is a separate deployable: a Cloudflare Worker over a D1 database, with its own
`package.json` and its own `npm install`. `worker/README.md` is the runbook; the design notes are
here.

**D1 rather than KV**, because counting activations is a read-modify-write on one row and KV is
eventually consistent across colos - a parent activating a tablet and a phone back to back could
have both reads see room and both writes succeed, quietly turning a two-device code into a
three-device one. D1 is SQLite with a single writer, so the whole limit is one conditional INSERT
that either changes a row or does not:

```sql
INSERT INTO activations (...) SELECT ?1, ?2, ?3, ?3
WHERE (SELECT COUNT(*) FROM activations WHERE code_hash = ?1)
      < (SELECT device_limit FROM codes WHERE hash = ?1)
```

**Only hashes are stored.** The database holds `sha256(code)`, never a code, so a dump of it is
worth nothing. `cid` - the first twelve hex characters of that hash - is the short public reference
carried in the token and quoted by support, so nobody has to paste a live code into a chat window.
It is `UNIQUE` so a collision would fail at insert rather than quietly making two codes look like
one.

Which means **the batch CSV `license_codes.mjs` writes is the only copy of those codes**. The script
uploads hashes and keeps the plaintext on your machine; lose the file before handing the codes out
and you mint a new batch. `codes-*.csv` is gitignored, and so is `.env` - neither the endpoint nor
the public key in it is secret (both ship in the bundle), but `.env` is where a private key gets
pasted by mistake.

The rate limiter counts *failed* attempts per IP. It is not what stops a brute force - 55 bits
already does - it is there so somebody hammering the endpoint cannot turn into a D1 bill. A parent
who mistypes twice and then reads the help text is not charged for it.

**Setting it up from nothing** (the runbook, with PowerShell forms, is `worker/README.md`):

```bash
cd worker && npm install
npx wrangler login
npx wrangler d1 create nauka-liter-licences  # paste the id into wrangler.toml
npm run schema:remote
npm run deploy                               # prints the Worker URL
cd .. && cp .env.example .env                # set VITE_ACTIVATION_URL to <that URL>/activate
node license_setup.mjs                       # keys and admin token, proven end to end
```

Then `node license_codes.mjs --count 50 --batch "2026-01-sklep"` mints and registers a batch.
Losing the private key does not break tablets already activated - they verify against the public key
their build shipped with - but every future code needs a new pair *and* a new build. Keep a backup
outside this repository.

**Use `license_setup.mjs`, not `license_keys.mjs` plus `wrangler secret put`.** The first setup went
wrong exactly that way. `secret put` reads a pasted value into a hidden prompt nobody can check, and
the stored admin token never matched what was typed - every admin call a 401. The keys had also been
generated more than once, so the private key on the Worker and the public key in `.env` came from
different runs; activation would have failed later as `server-error`, after spending a device slot.
`license_setup.mjs` mints all three values in one run, sends the secrets through `wrangler secret
bulk` and a temp file it deletes, writes the public key into `.env`, and then proves the pair against
the live Worker: it registers a throwaway code in batch `setup-check`, activates it, verifies the
token with the new public key, and disables the code. Only "Everything matches" means done.
Re-running it rotates all three together - free before launch, a new build after.
`license_keys.mjs` still only prints, for when a key is wanted without touching the Worker.

**What is deployed**, all on the Cloudflare free plan:

- Worker `nauka-liter-licence` at `https://nauka-liter-licence.bobrborys321.workers.dev`
- D1 `nauka-liter-licences` (EEUR). Its id is in `worker/wrangler.toml` and is not a secret.
- Pages project `naukaliterek`, the app itself, at `https://naukaliterek.pages.dev`

**And a second address is live: `https://literki.acentrum.pl`** (Borys, November 2026: both stay "for
now"). It is shared Apache hosting at AFTERMARKET.pl, the address the Android app opens and the
privacy policy names; `public/.htaccess` is its configuration (HTTPS, the single-page fallback,
`sw.js` never cached) and rides along in every build, which is why it is in `public/`. Nothing in
this repository deploys there: `deploy.yml` only reaches Cloudflare. `netlify.toml` is something else
again - Netlify builds test previews of pull requests, never anything customers use.

**Publishing is automatic:** `.github/workflows/deploy.yml` builds and deploys every push to `master`,
using repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_ACTIVATION_URL` and
`VITE_LICENSE_PUBLIC_KEY` (the build needs the last two, and `.env` is not in the repo). So anything
pushed to `master` reaches customers; unfinished work belongs on another branch. It is a GitHub
Action running wrangler rather than Cloudflare's Git integration because the project was created by
direct upload, which Cloudflare cannot switch to Git - that needs a new project, and a new project is
a new origin (see below). The manual equivalent is `npm run build`, then
`npx wrangler pages deploy dist --project-name naukaliterek --branch master`. **`--branch master` is
not optional:** it is the project's production branch, and a deploy labelled anything else becomes a
preview at a hashed subdomain while the real address keeps serving the old build. The project was
created with `wrangler pages project create --force`. Current wrangler delegates new Pages projects
to Workers, and that path died trying to parse the async `defineConfig` in `vite.config.js`; `--force`
was needed that once, and deploys to the existing project do not take it. A brand-new `*.pages.dev`
name also took a few minutes to resolve after its first deploy, which looks exactly like a failure.

`ALLOWED_ORIGIN` in `worker/wrangler.toml` holds both live origins, comma-separated
(`https://literki.acentrum.pl,https://naukaliterek.pages.dev`); the Worker answers each request with
whichever of them it came from. **Two origins means two licence slots on one tablet**: storage is per
origin, so a tablet activated in the browser on one address and then opened on the other - the
Android app is the acentrum one - asks for its code again and spends a second slot. That lasts until
one address is retired. Three things follow from the origin list:

- **Codes do not activate from `localhost`.** The Worker answers the dev and preview servers with the
  live origin, the browser refuses the response, and the app reports `offline`. Test activation on
  the live site, or against `wrangler dev --var "ALLOWED_ORIGIN:*"` with a local test build.
- **The origin is part of every licence.** The device id, the token and the precached build all live
  in storage scoped to that origin, so moving domains after launch - `naukaliterek.pl` was the plan -
  turns every activated tablet into a fresh install that asks for its code again and spends a slot.
  Change domains before selling, not after. To do it: add the domain to Cloudflare, attach it to the
  Pages project, redirect `www` to the bare domain (each origin has to be listed in `ALLOWED_ORIGIN`
  exactly, so a site reachable at an unlisted one answers `offline` there), set `ALLOWED_ORIGIN`,
  redeploy the Worker. `VITE_ACTIVATION_URL` can stay on `workers.dev`.

**A rebuild does not reach a browser that already has the app.** `autoUpdate` installs the new build
in the background and switches over on the next launch, so the page in front of you straight after a
build is still the old one. That became a real fault once: after the keys were rotated, a preview tab
kept running the cached build with the old public key, the Worker issued a perfectly good token for a
real code, and the stale page rejected it as `server-error` - with the slot already spent on the
server. Reading the `activations` table (`wrangler d1 execute ... --remote`) is how to tell "the
server said no" from "the page said no". After a key change, test with Ctrl+Shift+R or a fresh
profile. Customers only meet this if the key changes after launch, which it should not.

### Pictures

**One word bank, `data/wordsData.js`, feeds all four picture games** - Słowa (Rozsypanka), Sylaby,
Pierwsza głoska and the picture mode of Pary liter. A word is one row, `w('ŻY-RA-FA', 'animals',
'amber', 'clue')`: the syllables spell the word, and everything else (`id`, `name`, `length`,
`firstSound`, `digraph`, colours) is derived. `syllablesData.js` is just the rows with two
syllables or more. The file imports nothing, because `build_pictures.cjs` loads it with Node.

- **Each word has an illustration in `src/assets/pictures/words/`, found by the word's `id`** - its
  spelling folded to ASCII (ŻÓŁW -> `zolw.webp`), for the same reason the letter files are ASCII.
  `<Picture word={word.id} />` shows it. The illustrations are white discs with transparent
  corners, so they fill a round frame edge to edge rather than sitting inside one.
- **`node build_pictures.cjs <folder-of-pngs>` makes them.** The originals are 822px PNGs named
  after the word, 81 MB for the set, and are not in the repository; the script scales them to 400px
  WebP (twice the largest frame, 2.9 MB in all) by driving Chrome like `build_icons.cjs`, so it
  needs no image library. It ends by listing any picture without a word and any word without a
  picture, and fails if there are any. Do not hand-edit the WebP files - with one exception:
  `flaga.webp` was exported as the Swedish flag and was recoloured to the Polish one in place
  (November 2026). Re-export `flaga.png` as a Polish flag before the next full run, or it comes back.
  Four other exports did not show their word, so the word was changed to what is drawn: `reka`
  (one hand, was RĘCE), `gora` (was GÓRY), `mikrofon` (was DŹWIĘK) and `oczy` (was ŹRENICA).
  Name the PNGs that way in the export folder.
- **A file name is a pointer, not the spelling.** The export had `słonce`, `dzwig`, `dzwięk`,
  `gałąż`, `gwożdzie`, `zjeżdzalnia` and `łabędz`; all fold to the same slug as the correct word, and
  the spelling a child sees comes from `wordsData.js` (SŁOŃCE, DŹWIG, DŹWIĘK, GAŁĄŹ, GWOŹDZIE,
  ZJEŻDŻALNIA, ŁABĘDŹ).
- **The word names exactly what is drawn, including how many** - two boots are BUTY. Look at the
  picture before adding a word.
- **Syllables** split a consonant pair in the middle of a word (LAM-PA, CZAP-KA), unless the second
  is L, Ł or R after a stop, which start a syllable together (TY-GRYS, CE-GŁA, E-KRAN).

**First sounds are judged by sound, and where sound and spelling disagree the word is not asked.**
`firstSound` is the sound as written: a digraph for CH, CZ, DZ, DŻ, DŹ, RZ, SZ (held back for the
hard level), and `null` for the six words whose first sound is a soft one spelt with an I - SIEĆ
starts with Ś, NICI with Ń, DZIK with DŹ. Marking S right would teach the wrong sound and marking Ś
right contradicts the spelling, so those words are left out of first-sound rounds and still appear
wherever the question is about letters. `soundsClash` keeps two answers apart when they are the
same sound spelt differently (Ó and U, CH and H, RZ and Ż) or start with the same letter (C and
CZ): U is never offered against ÓSEMKA, and a HAK is never a wrong picture for CH.

**The right answer must not be the odd tile out.** Drawn from the 23 base letters alone, the answer
for ŁOŚ was the only accented tile and the answer for SZOPA the only two-letter one, so a child could
win without hearing anything. `letterDistractors` in Pierwsza głoska gives an accented answer at
least one other accented letter, a digraph other digraphs, and a plain answer now and then one of
either. Below the hardest level a letter and its accented twin (L and Ł) are never side by side.

**`HARD_WORDS` wait for the hardest setting** of Pierwsza głoska, sit out Pary liter and come last in
Słowa and Sylaby: words a pre-reader may not know (IMADŁO, CYRKIEL, EURO) and pictures likely to be
named as something else (a rider is "koń", a foal "konik"). **`PICTURE_GROUPS`** are pictures a child
can take for each other (KOŃ, JEŹDZIEC, ŹREBAK, DŻOKEJ; MOTYL and ĆMA; NOGA and BUTY; DZIENNIK and
NOTES); `picturesClash` keeps them out of the same round. Add to both when a new picture is
ambiguous.

**Słowa and Sylaby step through words easiest first, shuffled inside each difficulty**
(`shuffledByTier`) - by length in Słowa, by syllable count and then open syllables in Sylaby - in a
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
  it every device drew its own system font. The Polish file is a 4 KB subset of Fontsource's Latin
  Extended cut (`pyftsubset ... --unicodes="U+0104-0107,U+0118-0119,U+0141-0144,U+015A-015B,U+0179-017C"`).
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
