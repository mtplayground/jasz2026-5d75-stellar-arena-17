const DEFAULT_STEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.25;

export class GameLoop {
  constructor({ update, render, stepSeconds = DEFAULT_STEP_SECONDS }) {
    this.update = update;
    this.render = render;
    this.stepSeconds = stepSeconds;
    this.accumulator = 0;
    this.lastTime = 0;
    this.frameId = null;
    this.running = false;
    this.paused = false;
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame((time) => this.tick(time));
  }

  stop() {
    this.running = false;
    this.paused = true;

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  setPaused(paused) {
    if (this.paused === paused) {
      return;
    }

    this.paused = paused;
    this.lastTime = performance.now();
  }

  tick(time) {
    if (!this.running) {
      return;
    }

    if (!this.paused) {
      const elapsed = Math.min((time - this.lastTime) / 1000, MAX_FRAME_SECONDS);
      this.accumulator += elapsed;

      while (this.accumulator >= this.stepSeconds) {
        this.update(this.stepSeconds);
        this.accumulator -= this.stepSeconds;
      }

      this.render(this.accumulator / this.stepSeconds);
    }

    this.lastTime = time;
    this.frameId = requestAnimationFrame((nextTime) => this.tick(nextTime));
  }
}
