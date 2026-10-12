/**
 * CARDIOTWIN-4D: PROCEDURAL REAL-TIME 60FPS ECG MONITOR & WEBAUDIO SYNTHESIZER
 * Hospital-Grade Oscilloscope Canvas with Pathological Waveform Morphing:
 * - ST Elevation, ST Depression, T Inversion, Pathological Q-Waves
 * - Synced to Patient BPM with WebAudio "Lub-Dub" Acoustic Synthesis
 */

class CardioTwinECGMonitor {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`ECG Canvas #${canvasId} not found`);
      return;
    }
    this.ctx = this.canvas.getContext("2d");

    // State
    this.bpm = 75;
    this.audioEnabled = false;
    this.audioCtx = null;

    // ECG Pathological flags
    this.flags = {
      stElevation: 0,
      stDepression: 0,
      tInversion: 0,
      qWave: 0,
      poorR: 0
    };

    // Buffer for scrolling waveform
    this.points = [];
    this.maxPoints = 400;
    this.phase = 0; // 0.0 to 1.0 within cardiac beat cycle
    this.lastBeatTime = 0;

    this.resize();
    window.addEventListener("resize", () => this.resize());

    // Start loop
    this.lastFrameTime = performance.now();
    this.animate();
  }

  resize() {
    if (!this.canvas) return;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = this.width * window.devicePixelRatio;
    this.canvas.height = this.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.maxPoints = Math.floor(this.width);
  }

  setBpm(bpm) {
    this.bpm = Math.max(40, Math.min(180, bpm));
  }

  setFlags(ecgFlags = {}) {
    this.flags.stElevation = Number(ecgFlags.stElevation || ecgFlags["St Elevation"] || 0);
    this.flags.stDepression = Number(ecgFlags.stDepression || ecgFlags["St Depression"] || 0);
    this.flags.tInversion = Number(ecgFlags.tInversion || ecgFlags["Tinversion"] || 0);
    this.flags.qWave = Number(ecgFlags.qWave || ecgFlags["Q Wave"] || 0);
    this.flags.poorR = Number(ecgFlags.poorR || ecgFlags["Poor R Progression"] || 0);
  }

  /* ==============================================================================
     PROCEDURAL P-QRS-T CARDIAC VOLTAGE MORPHING
     ============================================================================== */
  sampleVoltage(p) {
    // p is normalized time within the beat: 0.0 -> 1.0
    // Voltage return in range [-1.0, 1.5]

    // 1. Isoelectric baseline offset (ST segment modifications)
    let baselineOffset = 0.0;
    if (p >= 0.35 && p <= 0.65) {
      if (this.flags.stElevation) baselineOffset = 0.32; // Elevated ST segment
      else if (this.flags.stDepression) baselineOffset = -0.28; // Depressed ST segment
    }

    // 2. P-Wave (Atrial Depolarization) around p = 0.12 - 0.22
    if (p >= 0.12 && p <= 0.22) {
      const u = (p - 0.12) / 0.10;
      return Math.sin(u * Math.PI) * 0.18;
    }

    // 3. PR Segment (Isoelectric line)
    if (p > 0.22 && p < 0.28) {
      return 0.0;
    }

    // 4. Q-Wave (Septal Depolarization) around p = 0.28 - 0.30
    if (p >= 0.28 && p <= 0.30) {
      const u = (p - 0.28) / 0.02;
      const qDepth = this.flags.qWave ? -0.45 : -0.12; // Pathological deep Q wave
      return Math.sin(u * Math.PI) * qDepth;
    }

    // 5. R-Wave (Ventricular Depolarization Spike) around p = 0.30 - 0.34
    if (p > 0.30 && p <= 0.34) {
      const u = (p - 0.30) / 0.04;
      const rHeight = this.flags.poorR ? 0.45 : 1.25; // Attenuated in poor R progression
      return Math.sin(u * Math.PI) * rHeight;
    }

    // 6. S-Wave around p = 0.34 - 0.37
    if (p > 0.34 && p <= 0.37) {
      const u = (p - 0.34) / 0.03;
      return -Math.sin(u * Math.PI) * 0.25;
    }

    // 7. ST Segment & T-Wave (Ventricular Repolarization) around p = 0.37 - 0.65
    if (p > 0.37 && p <= 0.65) {
      let tWave = 0.0;
      if (p >= 0.45 && p <= 0.60) {
        const u = (p - 0.45) / 0.15;
        // T-Inversion flips T-wave negative!
        const tAmp = this.flags.tInversion ? -0.32 : 0.30;
        tWave = Math.sin(u * Math.PI) * tAmp;
      }
      return baselineOffset + tWave;
    }

    // 8. Diastolic Resting Baseline (p = 0.65 to 1.0)
    return 0.0;
  }

  /* ==============================================================================
     WEBAUDIO PHONOCARDIOGRAM ACOUSTICS & CLINICAL ICU MONITOR BEEP
     ============================================================================== */
  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    if (this.audioEnabled && !this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    return this.audioEnabled;
  }

  // Authentic Clinical ICU / Cath-Lab Monitor Arterial Beep (880Hz Sine Bell Chime)
  playMonitorBeep() {
    if (!this.audioEnabled || !this.audioCtx) return;
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      // Clinical Telemetry Monitor Tone: 880Hz (A5 pure chime)
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      // Slight pitch bend down at end like authentic Philips/GE telemetry
      osc.frequency.exponentialRampToValueAtTime(820, now + 0.075);

      // Fast 5ms attack, 70ms exponential decay
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.32, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.08);

      // Trigger synchronized visual HUD telemetry pulse
      if (typeof window.onCardiacBeatBeep === "function") {
        window.onCardiacBeatBeep();
      }
    } catch (e) {
      console.warn("Audio beep error:", e);
    }
  }

  // Anatomical Heart Sounds (S1 & S2 Lub-Dub)
  playLubDub() {
    if (!this.audioEnabled || !this.audioCtx) return;
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }

    try {
      const now = this.audioCtx.currentTime;

      // S1 ("Lub" - 55Hz thud at ventricular systole)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(55, now);
      osc1.frequency.exponentialRampToValueAtTime(35, now + 0.12);

      gain1.gain.setValueAtTime(0.28, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // S2 ("Dub" - 75Hz at semilunar valve closure)
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(75, now + 0.22);
      osc2.frequency.exponentialRampToValueAtTime(45, now + 0.32);

      gain2.gain.setValueAtTime(0.22, now + 0.22);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.22);
      osc2.stop(now + 0.35);
    } catch (e) {
      console.warn("LubDub sound error:", e);
    }
  }

  /* ==============================================================================
     ANIMATION LOOP & OSCILLOSCOPE DRAWING
     ============================================================================== */
  animate() {
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000.0;
    this.lastFrameTime = now;

    // Advance beat cycle phase
    const beatsPerSec = this.bpm / 60.0;
    const prevPhase = this.phase;
    this.phase = (this.phase + dt * beatsPerSec) % 1.0;

    // Trigger Clinical ICU Monitor BEEP right at R-wave peak (phase ~ 0.32)
    if (prevPhase < 0.32 && this.phase >= 0.32) {
      this.playMonitorBeep();
    }

    // Trigger Lub-Dub anatomical heart acoustics at ventricular contraction (phase ~ 0.26)
    if (prevPhase < 0.26 && this.phase >= 0.26) {
      this.playLubDub();
    }

    // Sample voltage and add to scrolling point buffer
    const voltage = this.sampleVoltage(this.phase);
    // Add tiny realistic physiological noise (0.015)
    const noise = (Math.random() - 0.5) * 0.02;
    this.points.push(voltage + noise);

    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }

    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const midY = h * 0.58;
    const scaleY = h * 0.32;

    // 1. Dark CRT phosphor background
    ctx.fillStyle = "#03080e";
    ctx.fillRect(0, 0, w, h);

    // 2. Clinical Medical Grid (Subtle cyan/green coordinate lines)
    ctx.strokeStyle = "rgba(16, 185, 129, 0.08)";
    ctx.lineWidth = 1;
    const gridStep = 18;

    ctx.beginPath();
    for (let x = 0; x < w; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // 3. Draw Scrolling Phosphor Waveform with Glow
    if (this.points.length < 2) return;

    ctx.save();
    // Phosphor glow pass
    ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < this.points.length; i++) {
      const x = (i / this.maxPoints) * w;
      const y = midY - this.points[i] * scaleY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Sharp specular beam pass
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < this.points.length; i++) {
      const x = (i / this.maxPoints) * w;
      const y = midY - this.points[i] * scaleY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Sweep cursor tip glow
    const headX = (this.points.length / this.maxPoints) * w;
    const headY = midY - this.points[this.points.length - 1] * scaleY;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(headX, headY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

window.createECGMonitor = function(canvasId) {
  return new CardioTwinECGMonitor(canvasId);
};
