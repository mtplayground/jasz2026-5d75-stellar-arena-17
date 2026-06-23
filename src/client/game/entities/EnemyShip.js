import { ENEMY_TYPES } from "../data/enemyDefinitions.js";

let nextEnemyId = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.0001) {
    return { x: 0, y: 1, length: 0 };
  }
  return { x: x / length, y: y / length, length };
}

function rotateVector(vector, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

export class EnemyShip {
  constructor({ definition, x, y, phase }) {
    this.id = nextEnemyId;
    nextEnemyId += 1;
    this.definition = definition;
    this.spawnX = x;
    this.position = { x, y };
    this.previousPosition = { x, y };
    this.age = 0;
    this.phase = phase;
    this.fireTimer = definition.fireInterval * 0.55;
    this.maxHealth = definition.health;
    this.health = definition.health;
  }

  update(dt, player, size) {
    this.previousPosition.x = this.position.x;
    this.previousPosition.y = this.position.y;
    this.age += dt;
    this.fireTimer -= dt;

    if (this.definition.type === ENEMY_TYPES.striker) {
      this.updateStriker(dt, player, size);
    } else {
      this.updateScout(dt, size);
    }

    if (this.fireTimer <= 0 && this.position.y > this.definition.radius * size.pixelRatio) {
      this.fireTimer = this.definition.fireInterval;
      return this.createProjectiles(player, size.pixelRatio);
    }

    return [];
  }

  updateScout(dt, size) {
    const pixelRatio = size.pixelRatio;
    const amplitude = this.definition.driftAmplitude * pixelRatio;
    this.position.y += this.definition.speed * pixelRatio * dt;
    this.position.x =
      this.spawnX + Math.sin(this.age * this.definition.driftFrequency + this.phase) * amplitude;
  }

  updateStriker(dt, player, size) {
    const pixelRatio = size.pixelRatio;
    const holdY = size.height * 0.24;
    const drift = Math.sin(this.age * this.definition.driftFrequency + this.phase);
    const targetX = player.position.x + drift * this.definition.driftAmplitude * pixelRatio;

    if (this.position.y < holdY) {
      this.position.y += this.definition.speed * pixelRatio * dt;
    } else {
      this.position.y += Math.sin(this.age * 1.7 + this.phase) * 8 * pixelRatio * dt;
    }

    this.position.x +=
      (targetX - this.position.x) * clamp(this.definition.tracking * dt, 0, 1);
  }

  createProjectiles(player, pixelRatio) {
    const origin = {
      x: this.position.x,
      y: this.position.y + this.definition.radius * pixelRatio * 0.85,
    };
    const baseDirection = normalize(player.position.x - origin.x, player.position.y - origin.y);
    const count = this.definition.burstCount || 1;
    const spread = this.definition.burstSpread || 0;
    const projectiles = [];

    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0 : (index - (count - 1) / 2) * spread;
      const direction = rotateVector(baseDirection, offset);
      const speed = this.definition.projectileSpeed * pixelRatio;
      projectiles.push({
        x: origin.x,
        y: origin.y,
        vx: direction.x * speed,
        vy: direction.y * speed,
        radius: this.definition.projectileRadius * pixelRatio,
        color: this.definition.projectileColor,
        damage: this.definition.projectileDamage,
        age: 0,
        lifetime: 3.2,
      });
    }

    return projectiles;
  }

  isOffscreen(size) {
    const margin = this.definition.radius * size.pixelRatio * 3;
    return (
      this.position.y > size.height + margin ||
      this.position.x < -margin ||
      this.position.x > size.width + margin
    );
  }

  applyDamage(amount) {
    if (amount <= 0 || this.health <= 0) {
      return false;
    }

    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  isDestroyed() {
    return this.health <= 0;
  }

  getCollisionCircle(pixelRatio) {
    return {
      x: this.position.x,
      y: this.position.y,
      radius: this.definition.radius * pixelRatio * 0.82,
    };
  }

  draw(ctx, alpha, pixelRatio) {
    const x = this.previousPosition.x + (this.position.x - this.previousPosition.x) * alpha;
    const y = this.previousPosition.y + (this.position.y - this.previousPosition.y) * alpha;
    const radius = this.definition.radius * pixelRatio;

    ctx.save();
    ctx.translate(x, y);

    if (this.definition.type === ENEMY_TYPES.striker) {
      this.drawStriker(ctx, radius);
    } else {
      this.drawScout(ctx, radius);
    }

    this.drawHealthBar(ctx, radius);

    ctx.restore();
  }

  drawHealthBar(ctx, radius) {
    if (this.health >= this.maxHealth) {
      return;
    }

    const width = radius * 1.55;
    const height = Math.max(3, radius * 0.12);
    const y = -radius * 1.25;
    const ratio = Math.max(0, this.health / this.maxHealth);

    ctx.fillStyle = "rgba(7, 10, 18, 0.78)";
    ctx.fillRect(-width / 2, y, width, height);
    ctx.fillStyle = ratio > 0.45 ? "#d9f45f" : "#ff8a3d";
    ctx.fillRect(-width / 2, y, width * ratio, height);
  }

  drawScout(ctx, radius) {
    ctx.fillStyle = this.definition.color;
    ctx.beginPath();
    ctx.moveTo(0, radius);
    ctx.lineTo(radius * 0.82, -radius * 0.35);
    ctx.lineTo(radius * 0.24, -radius * 0.1);
    ctx.lineTo(0, -radius);
    ctx.lineTo(-radius * 0.24, -radius * 0.1);
    ctx.lineTo(-radius * 0.82, -radius * 0.35);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffd1d7";
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.12, radius * 0.18, radius * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawStriker(ctx, radius) {
    ctx.fillStyle = this.definition.color;
    ctx.beginPath();
    ctx.moveTo(0, radius * 0.95);
    ctx.lineTo(radius, radius * 0.2);
    ctx.lineTo(radius * 0.54, -radius * 0.18);
    ctx.lineTo(radius * 0.26, -radius * 0.9);
    ctx.lineTo(0, -radius * 0.48);
    ctx.lineTo(-radius * 0.26, -radius * 0.9);
    ctx.lineTo(-radius * 0.54, -radius * 0.18);
    ctx.lineTo(-radius, radius * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e9ddff";
    ctx.fillRect(-radius * 0.12, -radius * 0.34, radius * 0.24, radius * 0.8);
  }
}
