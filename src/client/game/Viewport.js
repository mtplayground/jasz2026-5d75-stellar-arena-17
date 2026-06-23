export class Viewport {
  constructor(canvas, onResize) {
    this.canvas = canvas;
    this.onResize = onResize;
    this.size = {
      width: 1,
      height: 1,
      pixelRatio: 1,
    };
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  start() {
    this.resizeObserver.observe(this.canvas);
    this.resize();
  }

  stop() {
    this.resizeObserver.disconnect();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * pixelRatio));
    const height = Math.max(1, Math.floor(rect.height * pixelRatio));

    if (
      this.canvas.width === width &&
      this.canvas.height === height &&
      this.size.pixelRatio === pixelRatio
    ) {
      return;
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.size = { width, height, pixelRatio };
    this.onResize(this.size);
  }
}
