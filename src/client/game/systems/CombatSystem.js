const PLAYER_CONTACT_DAMAGE = 28;
const IMPACT_LIFETIME = 0.36;
const PARTICLE_LIFETIME = 0.42;
const MAX_IMPACTS = 72;
const MAX_PARTICLES = 220;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function colorWithAlpha(color, alpha) {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
  }

  return color;
}

function circlesOverlap(a, b) {
  const radius = a.radius + b.radius;
  return Math.hypot(a.x - b.x, a.y - b.y) <= radius;
}

function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 0.0001) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  const closestX = start.x + dx * t;
  const closestY = start.y + dy * t;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

export class CombatSystem {
  constructor() {
    this.impacts = [];
    this.particles = [];
    this.events = [];
  }

  reset() {
    this.impacts = [];
    this.particles = [];
    this.events = [];
  }

  update(dt, { player, enemies, weapons, size }) {
    this.updateImpacts(dt);
    this.updateParticles(dt);

    if (player.gameOver) {
      enemies.projectiles = [];
      weapons.projectiles = [];
      weapons.missiles = [];
      weapons.beams = [];
      return;
    }

    this.resolvePlayerProjectiles(enemies, weapons, size.pixelRatio);
    this.resolvePlayerMissiles(enemies, weapons, size.pixelRatio);
    this.resolveLaserBeams(enemies, weapons, size.pixelRatio);
    this.resolveEnemyProjectiles(player, enemies, size.pixelRatio);
    this.resolveEnemyContact(player, enemies, size.pixelRatio);
    enemies.enemies = enemies.enemies.filter((enemy) => !enemy.isDestroyed());
  }

  updateImpacts(dt) {
    for (const impact of this.impacts) {
      impact.age += dt;
    }
    this.impacts = this.impacts.filter((impact) => impact.age < impact.lifetime);
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.max(0, 1 - particle.drag * dt);
      particle.vy *= Math.max(0, 1 - particle.drag * dt);
      particle.age += dt;
    }

    this.particles = this.particles.filter((particle) => particle.age < particle.lifetime);
  }

  resolvePlayerProjectiles(enemies, weapons, pixelRatio) {
    const remaining = [];

    for (const projectile of weapons.projectiles) {
      const hit = this.findProjectileHit(projectile, enemies.enemies, pixelRatio);
      if (hit) {
        this.damageEnemy(hit, projectile.damage, projectile.x, projectile.y, projectile.color, pixelRatio);
      } else {
        remaining.push(projectile);
      }
    }

    weapons.projectiles = remaining;
  }

  resolvePlayerMissiles(enemies, weapons, pixelRatio) {
    const remaining = [];

    for (const missile of weapons.missiles) {
      const trigger = this.findMissileProximityTrigger(missile, enemies.enemies, pixelRatio);
      if (trigger) {
        this.detonateMissile(missile, enemies.enemies, pixelRatio);
      } else {
        remaining.push(missile);
      }
    }

    weapons.missiles = remaining;
  }

  resolveLaserBeams(enemies, weapons, pixelRatio) {
    for (const beam of weapons.beams) {
      if (!beam.hitEnemyIds) {
        beam.hitEnemyIds = new Set();
      }

      const start = { x: beam.x, y: beam.y };
      const end = {
        x: beam.x + beam.direction.x * beam.range,
        y: beam.y + beam.direction.y * beam.range,
      };

      for (const enemy of enemies.enemies) {
        if (enemy.isDestroyed() || beam.hitEnemyIds.has(enemy.id)) {
          continue;
        }

        const enemyCircle = enemy.getCollisionCircle(pixelRatio);
        const beamRadius = Math.max(beam.width * 0.5, 4 * pixelRatio);
        if (distancePointToSegment(enemyCircle, start, end) <= enemyCircle.radius + beamRadius) {
          beam.hitEnemyIds.add(enemy.id);
          this.damageEnemy(enemy, beam.damage, enemy.position.x, enemy.position.y, beam.color, pixelRatio, 1.2);
        }
      }
    }
  }

  resolveEnemyProjectiles(player, enemies, pixelRatio) {
    const playerCircle = player.getCollisionCircle(pixelRatio);
    const remaining = [];

    for (const projectile of enemies.projectiles) {
      const projectileCircle = {
        x: projectile.x,
        y: projectile.y,
        radius: projectile.radius,
      };

      if (circlesOverlap(playerCircle, projectileCircle)) {
        const changed = player.applyDamage(projectile.damage);
        if (changed) {
          this.addImpact(projectile.x, projectile.y, projectile.color, projectile.radius * 2.2);
          this.addEvent("player-hit", projectile.x, projectile.y);
        }
      } else {
        remaining.push(projectile);
      }
    }

    enemies.projectiles = remaining;
  }

  resolveEnemyContact(player, enemies, pixelRatio) {
    const playerCircle = player.getCollisionCircle(pixelRatio);

    for (const enemy of enemies.enemies) {
      if (enemy.isDestroyed()) {
        continue;
      }

      const enemyCircle = enemy.getCollisionCircle(pixelRatio);
      if (circlesOverlap(playerCircle, enemyCircle)) {
        const damage = enemy.definition.collisionDamage || PLAYER_CONTACT_DAMAGE;
        const changed = player.applyDamage(damage);
        enemy.applyDamage(enemy.health);
        this.addImpact(enemy.position.x, enemy.position.y, enemy.definition.color, enemyCircle.radius * 1.7);
        this.addEvent("explosion", enemy.position.x, enemy.position.y);
        if (changed) {
          this.addImpact(player.position.x, player.position.y, "#d9f45f", playerCircle.radius * 1.4);
          this.addEvent("player-hit", player.position.x, player.position.y);
        }
      }
    }
  }

  findProjectileHit(projectile, enemies, pixelRatio) {
    const projectileCircle = {
      x: projectile.x,
      y: projectile.y,
      radius: projectile.radius,
    };

    return enemies.find((enemy) => {
      if (enemy.isDestroyed()) {
        return false;
      }
      return circlesOverlap(projectileCircle, enemy.getCollisionCircle(pixelRatio));
    });
  }

  findMissileProximityTrigger(missile, enemies, pixelRatio) {
    let nearest = null;
    let nearestDistance = Infinity;
    const proximityRadius = Math.max(missile.proximityRadius || 0, missile.radius || 0);

    for (const enemy of enemies) {
      if (enemy.isDestroyed()) {
        continue;
      }

      const enemyCircle = enemy.getCollisionCircle(pixelRatio);
      const centerDistance = Math.hypot(missile.x - enemyCircle.x, missile.y - enemyCircle.y);
      const edgeDistance = Math.max(0, centerDistance - enemyCircle.radius);
      if (edgeDistance <= proximityRadius && edgeDistance < nearestDistance) {
        nearest = enemy;
        nearestDistance = edgeDistance;
      }
    }

    return nearest;
  }

  detonateMissile(missile, enemies, pixelRatio) {
    const blastRadius = Math.max(missile.blastRadius || missile.radius * 2.5, missile.radius);
    let damagedAny = false;

    this.addImpact(missile.x, missile.y, missile.color, blastRadius * 0.86, 1.85);
    this.addEvent("explosion", missile.x, missile.y);

    for (const enemy of enemies) {
      if (enemy.isDestroyed()) {
        continue;
      }

      const enemyCircle = enemy.getCollisionCircle(pixelRatio);
      const distance = Math.hypot(missile.x - enemyCircle.x, missile.y - enemyCircle.y);
      const edgeDistance = Math.max(0, distance - enemyCircle.radius);
      if (edgeDistance > blastRadius) {
        continue;
      }

      const falloff = 1 - edgeDistance / blastRadius;
      const damageMultiplier = 0.45 + falloff * 0.55;
      this.damageEnemy(
        enemy,
        Math.max(1, Math.round(missile.damage * damageMultiplier)),
        enemyCircle.x,
        enemyCircle.y,
        missile.color,
        pixelRatio,
        1.12,
      );
      damagedAny = true;
    }

    if (!damagedAny) {
      this.addEvent("hit", missile.x, missile.y);
    }
  }

  damageEnemy(enemy, damage, x, y, color, pixelRatio, scale = 1) {
    const destroyed = enemy.applyDamage(damage);
    this.addImpact(x, y, color, 16 * pixelRatio * scale, scale);
    this.addEvent("hit", x, y);

    if (destroyed) {
      this.addImpact(
        enemy.position.x,
        enemy.position.y,
        enemy.definition.color,
        enemy.definition.radius * pixelRatio * 1.7,
        2.1,
      );
      this.addEvent("explosion", enemy.position.x, enemy.position.y);
    }
  }

  addImpact(x, y, color, radius, intensity = 1) {
    const normalizedIntensity = clamp(intensity, 0.65, 2.4);
    this.impacts.push({
      x,
      y,
      color,
      radius,
      innerRadius: radius * (0.24 + normalizedIntensity * 0.05),
      shockwaveRadius: radius * (0.82 + normalizedIntensity * 0.16),
      intensity: normalizedIntensity,
      age: 0,
      lifetime: IMPACT_LIFETIME * (0.92 + normalizedIntensity * 0.16),
    });

    if (this.impacts.length > MAX_IMPACTS) {
      this.impacts.splice(0, this.impacts.length - MAX_IMPACTS);
    }

    this.spawnImpactParticles(x, y, color, radius, normalizedIntensity);
  }

  spawnImpactParticles(x, y, color, radius, intensity) {
    const count = Math.round(clamp(8 + intensity * 10 + radius * 0.06, 8, 32));
    const speedBase = Math.max(70, radius * 2.2);

    for (let index = 0; index < count; index += 1) {
      const angle = randomBetween(0, Math.PI * 2);
      const speed = randomBetween(speedBase * 0.38, speedBase * (0.95 + intensity * 0.35));
      const size = randomBetween(1.4, 3.5 + intensity * 1.3);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        radius: size,
        age: 0,
        lifetime: PARTICLE_LIFETIME * randomBetween(0.72, 1.35 + intensity * 0.08),
        drag: randomBetween(2.7, 4.8),
      });
    }

    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    }
  }

  addEvent(type, x, y) {
    this.events.push({ type, x, y });
    if (this.events.length > 48) {
      this.events.splice(0, this.events.length - 48);
    }
  }

  consumeEvents() {
    return this.events.splice(0);
  }

  draw(ctx, pixelRatio) {
    for (const impact of this.impacts) {
      this.drawImpact(ctx, impact, pixelRatio);
    }

    for (const particle of this.particles) {
      this.drawParticle(ctx, particle, pixelRatio);
    }
  }

  drawImpact(ctx, impact, pixelRatio) {
    const progress = clamp(impact.age / impact.lifetime, 0, 1);
    const fade = 1 - progress;
    const shockwaveRadius = impact.shockwaveRadius * (0.32 + progress * 1.18);
    const coreRadius = impact.innerRadius * (1.05 - progress * 0.35);
    const ringWidth = Math.max(1.5, 5.5 * pixelRatio * impact.intensity * fade);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const flashGradient = ctx.createRadialGradient(
      impact.x,
      impact.y,
      0,
      impact.x,
      impact.y,
      Math.max(1, coreRadius * 2.2),
    );
    flashGradient.addColorStop(0, `rgba(255, 255, 255, ${0.86 * fade})`);
    flashGradient.addColorStop(0.36, colorWithAlpha(impact.color, 0.67 * fade));
    flashGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = flashGradient;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, coreRadius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.88 * fade;
    ctx.strokeStyle = impact.color;
    ctx.shadowColor = impact.color;
    ctx.shadowBlur = 22 * pixelRatio * impact.intensity;
    ctx.lineWidth = ringWidth;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, shockwaveRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1, ringWidth * 0.34);
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, shockwaveRadius * 0.58, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  drawParticle(ctx, particle, pixelRatio) {
    const progress = clamp(particle.age / particle.lifetime, 0, 1);
    const fade = 1 - progress;
    const radius = particle.radius * pixelRatio * (0.75 + fade * 0.5);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = fade;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 10 * pixelRatio * fade;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.72 * fade;
    ctx.strokeStyle = particle.color;
    ctx.lineWidth = Math.max(1, radius * 0.42);
    ctx.beginPath();
    ctx.moveTo(particle.x, particle.y);
    ctx.lineTo(particle.x - particle.vx * 0.018, particle.y - particle.vy * 0.018);
    ctx.stroke();
    ctx.restore();
  }
}
