export class Renderer {
  constructor(canvas, viewport) {
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Canvas 2D context is not available");
    }

    this.canvas = canvas;
    this.viewport = viewport;
    this.context = context;
    this.starLayers = this.createStarLayers();
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
  }

  render(alpha) {
    const { width, height } = this.viewport.size;
    const ctx = this.context;

    ctx.clearRect(0, 0, width, height);
    this.drawBackground(ctx, width, height);
    this.drawStars(ctx);
    this.drawCenterMarker(ctx, width, height, alpha);
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

  drawCenterMarker(ctx, width, height, alpha) {
    const centerX = width / 2;
    const centerY = height * 0.62;
    const pulse = 0.5 + alpha * 0.5;

    ctx.save();
    ctx.translate(centerX, centerY);

    ctx.fillStyle = "rgba(217, 244, 95, 0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 34, 46 + pulse * 4, 13 + pulse * 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d9f45f";
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(24, 30);
    ctx.lineTo(0, 18);
    ctx.lineTo(-24, 30);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#72d8ff";
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
