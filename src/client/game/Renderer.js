import { PlayerJet } from "./entities/PlayerJet.js";

export class Renderer {
  constructor(canvas, viewport, input) {
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Canvas 2D context is not available");
    }

    this.canvas = canvas;
    this.viewport = viewport;
    this.input = input;
    this.context = context;
    this.starLayers = this.createStarLayers();
    this.player = new PlayerJet();
  }

  createStarLayers() {
    return Array.from({ length: 72 }, (_, index) => {
      const layer = index % 3;
      return {
        x: (index * 131) % 1920,
        y: (index * 337) % 1080,
        radius: 0.8 + layer * 0.55,
        speed: 24 + layer * 28,
        alpha: 0.38 + layer * 0.18,
      };
    });
  }

  update(dt) {
    const { width, height } = this.viewport.size;

    for (const star of this.starLayers) {
      star.y += star.speed * dt;

      if (star.y > height + 8) {
        star.y = -8;
        star.x = (star.x + width * 0.37 + star.speed * 3) % width;
      }
    }

    this.player.update(dt, this.input.getFlightInput(), this.viewport.size);
  }

  render(alpha) {
    const { width, height } = this.viewport.size;
    const ctx = this.context;

    ctx.clearRect(0, 0, width, height);
    this.drawBackground(ctx, width, height);
    this.drawStars(ctx);
    this.drawPointerReticle(ctx);
    this.player.draw(ctx, alpha, this.viewport.size.pixelRatio);
  }

  drawBackground(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#070a12");
    gradient.addColorStop(0.52, "#111827");
    gradient.addColorStop(1, "#12151d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(114, 216, 255, 0.09)";
    ctx.lineWidth = 1;
    const gridSize = 56;

    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  drawStars(ctx) {
    for (const star of this.starLayers) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(247, 248, 251, ${star.alpha})`;
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPointerReticle(ctx) {
    const pointer = this.input.getFlightInput().pointer;
    if (!pointer) {
      return;
    }

    const radius = 10 * this.viewport.size.pixelRatio;
    ctx.save();
    ctx.strokeStyle = "rgba(114, 216, 255, 0.48)";
    ctx.lineWidth = 1.5 * this.viewport.size.pixelRatio;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pointer.x - radius * 1.6, pointer.y);
    ctx.lineTo(pointer.x - radius * 0.65, pointer.y);
    ctx.moveTo(pointer.x + radius * 0.65, pointer.y);
    ctx.lineTo(pointer.x + radius * 1.6, pointer.y);
    ctx.moveTo(pointer.x, pointer.y - radius * 1.6);
    ctx.lineTo(pointer.x, pointer.y - radius * 0.65);
    ctx.moveTo(pointer.x, pointer.y + radius * 0.65);
    ctx.lineTo(pointer.x, pointer.y + radius * 1.6);
    ctx.stroke();
    ctx.restore();
  }
}
