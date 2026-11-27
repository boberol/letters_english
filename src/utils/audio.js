// Web Audio API Sound Synthesizer (100% Dependency-free, zero network requests)

class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    // Gap between the audio clock and performance.now(), in seconds, and when
    // it was last measured. Only the metronome needs it - see syncClock.
    this.clockGap = null;
    this.clockSyncedAt = null;

    // Load mute preference
    try {
      const saved = localStorage.getItem('letter_app_muted');
      if (saved !== null) {
        this.isMuted = JSON.parse(saved);
      }
    } catch (e) {}
  }

  initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem('letter_app_muted', JSON.stringify(this.isMuted));
    } catch (e) {}
    return this.isMuted;
  }

  getMuted() {
    return this.isMuted;
  }

  // Soft cheerful click / pop
  playClick() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {}
  }

  // Magic whoosh / shimmer when randomizing
  playRandom() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      
      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = now + idx * 0.04;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(start);
        osc.stop(start + 0.15);
      });
    } catch (e) {}
  }

  // One beep of a 3-2-1 countdown; the last one, on "go", is higher and longer.
  playCountdown(final = false) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      const dur = final ? 0.35 : 0.15;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(final ? 988 : 659, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + dur);
    } catch (e) {}
  }

  // Triumphant fanfare for successful completion
  playSuccess() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [
        { freq: 523.25, dur: 0.12, delay: 0 },    // C5
        { freq: 659.25, dur: 0.12, delay: 0.1 },  // E5
        { freq: 783.99, dur: 0.15, delay: 0.2 },  // G5
        { freq: 1046.50, dur: 0.4, delay: 0.32 }  // C6 (held)
      ];

      notes.forEach(({ freq, dur, delay }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + delay;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + dur);
      });
    } catch (e) {}
  }

  // How long a sound queued for "now" takes to come out of the speaker: the
  // browser's own buffering plus the device's - about 50ms on a desktop, a
  // quarter of a second or more over Bluetooth. Anything drawn in time with a
  // sound should run this late, or the picture moves ahead of what is heard.
  // Zero when muted: there is nothing to line up with.
  outputDelayMs() {
    if (this.isMuted || !this.ctx) return 0;
    return ((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000;
  }

  // Keeps track of where performance.now() sits on the audio clock.
  //
  // currentTime only moves when the sound hardware asks for its next block of
  // sound: every 10ms on a desktop, 21ms or more on a phone. Reading it afresh
  // to place each tick put every tick somewhere else inside that block, so the
  // beat limped on exactly the devices this app is for - measured at 23ms of
  // spread with a phone-sized block, against 1ms on this desktop.
  //
  // The gap between the two clocks is tracked instead of read anew each time.
  // currentTime can only lag real time, never lead it, so the highest reading
  // is the truest one; letting the estimate sink half a millisecond a second
  // lets it follow the two clocks drifting apart over a long session without
  // chasing every lagging reading back down. A jump - a context that was
  // suspended, a device changed - starts it over.
  syncClock() {
    if (!this.ctx) return;

    const now = performance.now();
    const gap = this.ctx.currentTime - now / 1000;
    const elapsed = this.clockSyncedAt === null ? 0 : (now - this.clockSyncedAt) / 1000;
    this.clockSyncedAt = now;

    if (this.clockGap === null || Math.abs(gap - this.clockGap) > 0.5) {
      this.clockGap = gap;
    } else {
      this.clockGap = Math.max(gap, this.clockGap - 0.0005 * elapsed);
    }
  }

  // One metronome beat, at a performance.now() moment. The metronome queues
  // beats ahead of time so a busy page cannot make it limp, and hands over the
  // moment itself rather than a delay from now - see syncClock. `high` picks
  // the tik over the tak.
  playTick(perfTime, high = true) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      this.syncClock();
      let start = perfTime / 1000 + this.clockGap;
      if (start < this.ctx.currentTime) {
        // Its moment has already gone: the page stalled, or the audio clock
        // moved on while the context was asleep. Play it now, and measure the
        // gap again rather than trust a reading that is plainly stale.
        this.clockGap = null;
        start = this.ctx.currentTime;
      }

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(high ? 1320 : 990, start);

      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.06);
    } catch (e) {}
  }

  // Springy "boing" for a sticker that dances when it is tapped: a pitch that
  // overshoots and settles, wobbling on the way down.
  playBoing() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const wobble = this.ctx.createOscillator();
      const wobbleDepth = this.ctx.createGain();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.06);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.32);

      wobble.frequency.setValueAtTime(18, now);
      wobbleDepth.gain.setValueAtTime(40, now);
      wobble.connect(wobbleDepth);
      wobbleDepth.connect(osc.frequency);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      wobble.start(now);
      osc.stop(now + 0.34);
      wobble.stop(now + 0.34);
    } catch (e) {}
  }

  // Falling whoosh for a sticker dropped in the bin.
  playWhoosh() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.22);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  // Gentle low tone for error
  playError() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.18);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch (e) {}
  }
}

export const sounds = new SoundManager();
