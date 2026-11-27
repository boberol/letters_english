import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Play, Pause, Sliders } from 'lucide-react';
import { sounds } from '../utils/audio';
import { loadSetting, saveSetting } from '../utils/repetitions';
import { useCountdown } from '../hooks/useCountdown';
import Picture from './Picture';
import Countdown from './Countdown';
import RunSettings from './RunSettings';
import SettingsModal from './SettingsModal';
import { useWakeLock } from '../hooks/useWakeLock';

const COLOR = '#0F766E';
const STORAGE_KEY = 'letter_app_metronome_bpm';
const REPS_KEY = 'letter_app_metronome_reps';
const COUNTDOWN_KEY = 'letter_app_metronome_countdown';

// How many ticks before it stops on its own. 0 runs until stopped.
const BEAT_OPTIONS = [0, 8, 16, 24, 32];

// Beats per minute. The slow end is one loop of a szlaczek every two seconds,
// which is where a child just learning the movement starts.
const MIN_BPM = 30;
const MAX_BPM = 180;
const DEFAULT_BPM = 60;
// What one tap on the turtle or the rabbit changes.
const STEP_BPM = 10;

// How far the arm swings to each side, in degrees.
const SWING_DEG = 28;

// Where the arm is across its swing, -1 (left) to 1 (right), for a beat count:
// constant speed, turning round exactly on the tick. A pendulum's own easing (a
// cosine) was tried first and looked natural, but it keeps the arm within a few
// degrees of the end for a fifth of every beat, centred on the tick - so the arm
// seemed to arrive early and wait there, and the beat looked off time.
const swingAt = (phase) => {
  const t = ((phase % 2) + 2) % 2;
  return t <= 1 ? 2 * t - 1 : 3 - 2 * t;
};

// Ticks are queued on the audio clock ahead of time rather than played when a
// timer fires. A timer can land tens of milliseconds late whenever the page is
// busy, and a metronome that limps is worse than none; a sound queued on the
// audio clock plays on time however late the timer that queued it was. The
// queue runs a third of a second ahead, because a phone with other work on can
// stall for longer than the 120ms this first had, and a tick queued after its
// moment has passed can only be played late.
// The queue is looked at twice as often as it strictly needs to be: each run
// also takes a reading of the two clocks, and those readings need to have
// settled by the time the first tick is queued.
const SCHEDULER_MS = 25;
const LOOKAHEAD_MS = 300;

// Where the arm is pinned, in the drawing's own units. Kept in step with
// transform-origin on .metronome-arm in index.css.
const PIVOT_Y = 182;

const clampBpm = (value) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));

export default function MetronomeTool({ onBack }) {
  const [bpm, setBpm] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved) return clampBpm(saved);
    } catch (e) {}
    return DEFAULT_BPM;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [beatLimit, setBeatLimit] = useState(() =>
    loadSetting(REPS_KEY, 0, (v) => BEAT_OPTIONS.includes(v))
  );
  const [useCountdownSetting, setUseCountdownSetting] = useState(() =>
    loadSetting(COUNTDOWN_KEY, true, (v) => typeof v === 'boolean')
  );
  const [showSettings, setShowSettings] = useState(false);
  // Ticks heard so far in this run, shown only when there is a limit. Updated
  // once a beat, not once a frame.
  const [beatsDone, setBeatsDone] = useState(0);
  const countdown = useCountdown();
  // Read inside the running effect, which must not restart when it changes.
  const beatLimitRef = useRef(beatLimit);
  useEffect(() => {
    beatLimitRef.current = beatLimit;
  }, [beatLimit]);

  const armRef = useRef(null);
  const leftLightRef = useRef(null);
  const rightLightRef = useRef(null);

  // The beat as a continuous count: whole numbers are ticks, and the arm is at
  // one end on each of them. Stored as an anchor (a phase at a moment) plus a
  // period, so a tempo change re-anchors at "now" and the arm carries on from
  // where it is instead of jumping.
  const clockRef = useRef({ time: 0, phase: 0, period: 60000 / bpm, lastBeat: -1 });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(bpm));
    } catch (e) {}
  }, [bpm]);

  useEffect(() => saveSetting(REPS_KEY, beatLimit), [beatLimit]);
  useEffect(() => saveSetting(COUNTDOWN_KEY, useCountdownSetting), [useCountdownSetting]);

  useEffect(() => {
    const clock = clockRef.current;
    const now = performance.now();
    const phaseNow = clock.phase + (now - clock.time) / clock.period;
    // Beats are queued a third of a second ahead, and those are already spoken
    // for. The new speed starts at the first beat not queued yet, so a tick
    // already on its way keeps its moment and the arm arrives at it going the
    // speed it set off with. Re-anchoring at "now" cut that one beat short.
    const anchorPhase = Math.max(phaseNow, clock.lastBeat + 1);
    clock.time = now + (anchorPhase - phaseNow) * clock.period;
    clock.phase = anchorPhase;
    clock.period = 60000 / bpm;
  }, [bpm]);

  useEffect(() => {
    if (!isPlaying) return undefined;

    const clock = clockRef.current;
    // Start half a beat before the first tick, with the arm upright, so it
    // swings out to its first tick instead of jumping to the end of its travel.
    clock.time = performance.now();
    clock.phase = -0.5;
    clock.lastBeat = -1;
    // Fixed for the run: changing the setting mid-run applies to the next one.
    const limit = beatLimitRef.current;
    let shownBeats = 0;

    const phaseAt = (time) => clock.phase + (time - clock.time) / clock.period;
    const timeOfBeat = (beat) => clock.time + (beat - clock.phase) * clock.period;

    const schedule = () => {
      const now = performance.now();
      // Keeps the reading of where the two clocks sit fresh between ticks, so
      // the first beats are placed as accurately as the rest.
      sounds.syncClock();
      // A tab that was throttled can come back several beats behind. Skip the
      // ones already missed rather than playing them all at once.
      let beat = Math.max(clock.lastBeat + 1, Math.ceil(phaseAt(now)));
      while (timeOfBeat(beat) < now + LOOKAHEAD_MS && (limit === 0 || beat < limit)) {
        // Tik on the left, tak on the right. The beat's own moment goes over,
        // not a delay from now, so that a coarse audio clock cannot smear it.
        sounds.playTick(timeOfBeat(beat), beat % 2 === 0);
        clock.lastBeat = beat;
        beat += 1;
      }
    };

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const arm = armRef.current;
    const lights = [leftLightRef.current, rightLightRef.current];
    let frame = 0;

    // The drawing is moved straight from the animation frame rather than
    // through state: re-rendering the tool sixty times a second for one rotate
    // would be all cost and no benefit.
    const draw = () => {
      // Sampled here as well as in the scheduler: the reading settles over
      // several samples (see syncClock), and the first tick is queued a third
      // of a second in, which is only a handful of scheduler runs.
      sounds.syncClock();
      // Drawn late by as long as a tick takes to reach the speaker, so the arm
      // turns round when the tick is heard rather than when it was queued.
      const phase = phaseAt(performance.now() - sounds.outputDelayMs());
      // With reduced motion the arm stays upright and only the lights keep time.
      const angle = reduceMotion ? 0 : SWING_DEG * swingAt(phase);
      if (arm) arm.style.transform = `rotate(${angle}deg)`;

      const beat = Math.floor(phase);
      const glow = beat >= 0 ? Math.max(0, 1 - (phase - beat) * 3) : 0;

      if (limit > 0) {
        const heard = Math.min(limit, beat + 1);
        if (heard > shownBeats) {
          shownBeats = heard;
          setBeatsDone(heard);
        }
        // Half a beat after the last tick the arm is upright again: stop there.
        if (phase >= limit - 0.5) {
          setIsPlaying(false);
          return;
        }
      }
      lights.forEach((light, side) => {
        if (light) light.style.opacity = String(0.2 + 0.8 * (beat % 2 === side ? glow : 0));
      });

      frame = requestAnimationFrame(draw);
    };

    // Timers in a hidden tab are throttled to once a second, which would turn
    // the beat into a stutter. Stop instead; the child taps Start again.
    const onVisibilityChange = () => {
      if (document.hidden) setIsPlaying(false);
    };

    schedule();
    const timer = setInterval(schedule, SCHEDULER_MS);
    frame = requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(timer);
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // Clearing the inline rotate hands the arm back to the stylesheet, which
      // eases it upright.
      if (arm) arm.style.transform = '';
      lights.forEach((light) => {
        if (light) light.style.opacity = '';
      });
    };
  }, [isPlaying]);

  const togglePlaying = () => {
    sounds.playClick();
    if (isPlaying || countdown.running) {
      countdown.cancel();
      setIsPlaying(false);
    } else {
      // The count starts over with each run (here rather than in the run's
      // effect, which would set state as it starts).
      setBeatsDone(0);
      if (useCountdownSetting) countdown.start(() => setIsPlaying(true));
      else setIsPlaying(true);
    }
  };
  const running = isPlaying || countdown.running;
  // A metronome is listened to, not touched: without this the tablet dims and
  // locks in the middle of a run.
  useWakeLock(running);

  const stepBpm = (delta) => {
    // A click on top of a running beat would sound like an extra tick.
    if (!isPlaying) sounds.playClick();
    // From the latest value, not the rendered one: two taps landing before a
    // re-render would otherwise both step from the same number and count once.
    setBpm((current) => clampBpm(current + delta));
  };

  // Like a real metronome, the weight sits high for slow and low for fast.
  const share = (bpm - MIN_BPM) / (MAX_BPM - MIN_BPM);
  const weightY = 62 + share * 80;

  return (
    <div className="stage-container metronome-stage">
      <div className="stage-header">
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Wróć do wyboru zabaw"
        >
          <ChevronLeft color={COLOR} size={28} />
        </button>

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge">🎵</span>
          <span className="stage-title" style={{ color: COLOR }}>
            Metronom
          </span>
        </div>

        <button
          className="settings-toggle-btn"
          onClick={() => {
            sounds.playClick();
            setShowSettings(true);
          }}
          title="Ustawienia"
          aria-label="Ustawienia metronomu"
        >
          <Sliders size={20} color="#334155" aria-hidden="true" />
        </button>
      </div>

      {/* The picture is the biggest thing on the screen, so it starts and stops
          too - a child who cannot read "Start" taps the metronome itself. */}
      <button
        type="button"
        className={`metronome-face glass-panel ${isPlaying ? 'is-playing' : ''}`}
        onClick={togglePlaying}
        aria-label={running ? 'Zatrzymaj metronom' : 'Włącz metronom'}
        aria-pressed={running}
      >
        <svg viewBox="0 0 200 220" className="metronome-svg" aria-hidden="true">
          <path
            d="M80 16 H120 L170 196 H30 Z"
            fill="#FDE68A"
            stroke="#B45309"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path d="M100 40 V166" stroke="#FEF3C7" strokeWidth="16" strokeLinecap="round" />

          <g ref={armRef} className="metronome-arm">
            <line
              x1="100"
              y1={PIVOT_Y}
              x2="100"
              y2="26"
              stroke="#334155"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <rect
              className="metronome-weight"
              x="83"
              y={weightY - 11}
              width="34"
              height="22"
              rx="6"
              fill={COLOR}
              stroke="#FFFFFF"
              strokeWidth="3"
            />
          </g>
          <circle cx="100" cy={PIVOT_Y} r="9" fill="#334155" />

          <rect x="14" y="194" width="172" height="22" rx="11" fill="#78350F" />
          <circle ref={leftLightRef} className="metronome-light" cx="46" cy="205" r="7" fill="#FACC15" />
          <circle ref={rightLightRef} className="metronome-light" cx="154" cy="205" r="7" fill="#FACC15" />
        </svg>
      </button>

      <div className="metronome-tempo glass-panel">
        <div className="metronome-bpm" aria-hidden="true">
          <span className="metronome-bpm-value" style={{ color: COLOR }}>
            {bpm}
          </span>
          <span className="metronome-bpm-unit">na minutę</span>
          {beatLimit > 0 && (isPlaying || beatsDone > 0) && (
            <span className="metronome-beat-count">
              {beatsDone} / {beatLimit}
            </span>
          )}
        </div>

        <div className="metronome-slider-row">
          <button
            type="button"
            className="metronome-step-btn"
            onClick={() => stepBpm(-STEP_BPM)}
            disabled={bpm <= MIN_BPM}
            aria-label="Wolniej"
            title="Wolniej"
          >
            <Picture emoji="🐢" size="2rem" />
          </button>

          <input
            type="range"
            className="metronome-slider"
            min={MIN_BPM}
            max={MAX_BPM}
            step="1"
            value={bpm}
            onChange={(e) => setBpm(clampBpm(Number(e.target.value)))}
            aria-label="Tempo"
            aria-valuetext={`${bpm} uderzeń na minutę`}
            style={{ '--fill': share }}
          />

          <button
            type="button"
            className="metronome-step-btn"
            onClick={() => stepBpm(STEP_BPM)}
            disabled={bpm >= MAX_BPM}
            aria-label="Szybciej"
            title="Szybciej"
          >
            <Picture emoji="🐇" size="2rem" />
          </button>
        </div>
      </div>

      <button
        className={`action-btn metronome-play-btn ${running ? 'btn-clear' : 'btn-start'}`}
        onClick={togglePlaying}
      >
        {running ? (
          <>
            <Pause size={20} style={{ marginRight: '8px' }} /> Stop
          </>
        ) : (
          <>
            <Play size={20} style={{ marginRight: '8px' }} /> Start
          </>
        )}
      </button>

      <Countdown count={countdown.count} color={COLOR} />

      {showSettings && (
        <SettingsModal title="Ustawienia metronomu" onClose={() => setShowSettings(false)}>
          <RunSettings
            title="Ile uderzeń:"
            unit="uderzeniach"
            options={BEAT_OPTIONS}
            repetitions={beatLimit}
            onRepetitions={setBeatLimit}
            countdown={useCountdownSetting}
            onCountdown={setUseCountdownSetting}
          />
        </SettingsModal>
      )}
    </div>
  );
}
