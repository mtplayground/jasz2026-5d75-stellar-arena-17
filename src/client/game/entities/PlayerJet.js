const TURN_SPEED = 12;
const BASE_ACCELERATION = 1180;
const BASE_MAX_SPEED = 660;
const BASE_DRAG = 5.4;
const BASE_RADIUS = 28;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.0001) {
    return { x: 0, y: 0, length: 0 };
  }
  return { x: x / length, y: y / length, length };
}

function wrapAngle(angle) {
  let wrapped = angle;
  while (wrapped <= -Math.PI) wrapped += Math.PI * 2;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  return wrapped;
}

function lerpAngle(start, end, alpha) {
  return start + wrapAngle(end - start) * alpha;
}

export class PlayerJet {
  constructor() {
    this.position = { x: 0, y: 0 };
    this.previousPosition = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.angle = 0;
    this.previousAngle = 0;
    this.initialized = false;
  }

  syncToViewport(size) {
    const radius = BASE_RADIUS * size.pixelRatio;

    if (!this.initialized) {
      this.position.x = size.width / 2;
      this.position.y = size.height * 0.68;
      this.previousPosition.x = this.position.x;
      this.previousPosition.y = this.position.y;
      this.initialized = true;
      return;
    }

    this.position.x = clamp(this.position.x, radius, size.width - radius);
    this.position.y = clamp(this.position.y, radius, size.height - radius);
  }

  update(dt, input, size) {
    this.syncToViewport(size);

    this.previousPosition.x = this.position.x;
    this.previousPosition.y = this.position.y;
    this.previousAngle = this.angle;

    const pixelRatio = size.pixelRatio;
    const keyboard = normalize(input.moveX, input.moveY);
    const pointerDirection = input.pointer
      ? normalize(input.pointer.x - this.position.x, input.pointer.y - this.position.y)
      : { x: 0, y: 0, length: 0 };

    const steering =
      keyboard.length > 0
        ? keyboard
        : pointerDirection.length > BASE_RADIUS * pixelRatio * 0.45
          ? pointerDirection
          : { x: 0, y: 0, length: 0 };

    if (steering.length > 0) {
      const acceleration = BASE_ACCELERATION * pixelRatio;
      this.velocity.x += steering.x * acceleration * dt;
      this.velocity.y += steering.y * acceleration * dt;
    }

    const maxSpeed = BASE_MAX_SPEED * pixelRatio;
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed > maxSpeed) {
      this.velocity.x = (this.velocity.x / speed) * maxSpeed;
      this.velocity.y = (this.velocity.y / speed) * maxSpeed;
    }

    const drag = Math.max(0, 1 - BASE_DRAG * dt);
    if (steering.length === 0) {
      this.velocity.x *= drag;
      this.velocity.y *= drag;
    }

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;

    this.constrainToBounds(size);

    const facing =
      steering.length > 0
        ? steering
        : speed > 12 * pixelRatio
          ? normalize(this.velocity.x, this.velocity.y)
          : null;

    if (facing) {
      const targetAngle = Math.atan2(facing.y, facing.x) + Math.PI / 2;
      this.angle = lerpAngle(this.angle, targetAngle, Math.min(1, TURN_SPEED * dt));
    }
  }

  constrainToBounds(size) {
    const radius = BASE_RADIUS * size.pixelRatio;
    const nextX = clamp(this.position.x, radius, size.width - radius);
    const nextY = clamp(this.position.y, radius, size.height - radius);

    if (nextX !== this.position.x) {
      this.velocity.x = 0;
      this.position.x = nextX;
    }

    if (nextY !== this.position.y) {
      this.velocity.y = 0;
      this.position.y = nextY;
    }
  }

  draw(ctx, alpha, pixelRatio) {
    const x = this.previousPosition.x + (this.position.x - this.previousPosition.x) * alpha;
    const y = this.previousPosition.y + (this.position.y - this.previousPosition.y) * alpha;
    const angle = lerpAngle(this.previousAngle, this.angle, alpha);
    const scale = pixelRatio;
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const flame = clamp(speed / (BASE_MAX_SPEED * pixelRatio), 0, 1);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    ctx.fillStyle = `rgba(217, 244, 95, ${0.14 + flame * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(0, 30, 40 + flame * 10, 11 + flame * 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 138, 61, ${0.45 + flame * 0.45})`;
    ctx.beginPath();
    ctx.moveTo(-8, 24);
    ctx.lineTo(0, 44 + flame * 18);
    ctx.lineTo(8, 24);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#d9f45f";
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(23, 24);
    ctx.lineTo(7, 16);
    ctx.lineTo(0, 30);
    ctx.lineTo(-7, 16);
    ctx.lineTo(-23, 24);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#72d8ff";
    ctx.beginPath();
    ctx.moveTo(0, -27);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 3);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(7, 10, 18, 0.58)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(23, 24);
    ctx.lineTo(7, 16);
    ctx.lineTo(0, 30);
    ctx.lineTo(-7, 16);
    ctx.lineTo(-23, 24);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  getForwardVector() {
    return {
      x: Math.sin(this.angle),
      y: -Math.cos(this.angle),
    };
  }

  getWeaponMount(pixelRatio) {
    const forward = this.getForwardVector();
    const offset = 40 * pixelRatio;
    return {
      x: this.position.x + forward.x * offset,
      y: this.position.y + forward.y * offset,
    };
  }
}
