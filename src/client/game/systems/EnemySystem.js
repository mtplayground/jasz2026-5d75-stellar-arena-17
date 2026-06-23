import {
  ENEMY_DEFINITIONS,
  ENEMY_SPAWN_SEQUENCE,
} from "../data/enemyDefinitions.js";
import { EnemyShip } from "../entities/EnemyShip.js";

export class EnemySystem {
  constructor() {
    this.enemies = [];
    this.projectiles = [];
    this.spawnIndex = 0;
    this.totalSpawned = 0;
  }

  reset() {
    this.enemies = [];
    this.projectiles = [];
    this.spawnIndex = 0;
    this.totalSpawned = 0;
  }

  update(dt, player, size) {
    for (const enemy of this.enemies) {
      const shots = enemy.update(dt, player, size);
      this.projectiles.push(...shots);
    }

    this.enemies = this.enemies.filter((enemy) => !enemy.isOffscreen(size));
    this.updateProjectiles(dt, size);
  }

  spawnEnemy(size, requestedType = null) {
    const type = requestedType || ENEMY_SPAWN_SEQUENCE[this.spawnIndex % ENEMY_SPAWN_SEQUENCE.length];
    const definition = ENEMY_DEFINITIONS[type];
    if (!definition) {
      return;
    }

    const pixelRatio = size.pixelRatio;
    const laneCount = 5;
    const lane = (this.spawnIndex * 2 + this.totalSpawned) % laneCount;
    const laneWidth = size.width / laneCount;
    const x = laneWidth * (lane + 0.5);
    const y = -definition.radius * pixelRatio * 1.7;
    const phase = this.totalSpawned * 0.83;

    this.enemies.push(new EnemyShip({ definition, x, y, phase }));
    this.spawnIndex += 1;
    this.totalSpawned += 1;
  }

  updateProjectiles(dt, size) {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.age += dt;
    }

    this.projectiles = this.projectiles.filter(
      (projectile) =>
        projectile.age < projectile.lifetime &&
        projectile.x > -60 &&
        projectile.x < size.width + 60 &&
        projectile.y > -60 &&
        projectile.y < size.height + 60,
    );
  }

  draw(ctx, alpha, pixelRatio) {
    for (const enemy of this.enemies) {
      enemy.draw(ctx, alpha, pixelRatio);
    }

    this.drawProjectiles(ctx);
  }

  drawProjectiles(ctx) {
    for (const projectile of this.projectiles) {
      const alpha = 1 - projectile.age / projectile.lifetime;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = projectile.color;
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
