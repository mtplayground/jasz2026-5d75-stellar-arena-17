export class SoundSystem {
  constructor() {
    this.context = null;
    this.lastPlayedAt = new Map();
  }

  ensureContext() {
    if (this.context) {
      return this.context;
    }

    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) {
      return null;
    }

    this.context = new AudioContext();
    return this.context;
  }

  play(type) {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }

    const now = context.currentTime;
    const throttle = type === "shoot-projectile" ? 0.045 : 0.02;
    const last = this.lastPlayedAt.get(type) || 0;
    if (now - last < throttle) {
      return;
    }
    this.lastPlayedAt.set(type, now);

    if (type === "shoot-projectile") this.tone(420, 0.04, 0.035, "square");
    if (type === "shoot-missile") this.tone(150, 0.1, 0.055, "sawtooth", 0.7);
    if (type === "shoot-laser") this.tone(780, 0.18, 0.06, "triangle", 1.35);
    if (type === "hit") this.noise(0.05, 0.045, 900);
    if (type === "player-hit") this.noise(0.08, 0.08, 240);
    if (type === "explosion") this.noise(0.18, 0.12, 130);
    if (type === "loot") {
      this.tone(520, 0.08, 0.05, "sine");
      window.setTimeout(() => this.tone(780, 0.12, 0.05, "sine"), 90);
      window.setTimeout(() => this.tone(1040, 0.16, 0.045, "triangle"), 180);
    }
  }

  tone(frequency, duration, gainValue, type = "sine", bend = 1) {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * bend), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  noise(duration, gainValue, cutoff) {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const now = context.currentTime;
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, now);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start(now);
  }
}
