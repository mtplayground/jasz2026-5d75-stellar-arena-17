const PLAYER_CONTACT_DAMAGE = 28;
const IMPACT_LIFETIME = 0.36;

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
    this.events = [];
  }

  reset() {
    this.impacts = [];
    this.events = [];
  }

  update(dt, { player, enemies, weapons, size }) {
    this.updateImpacts(dt);

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

    this.addImpact(missile.x, missile.y, missile.color, blastRadius * 0.72);
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
    this.addImpact(x, y, color, 16 * pixelRatio * scale);
    this.addEvent("hit", x, y);

    if (destroyed) {
      this.addImpact(
        enemy.position.x,
        enemy.position.y,
        enemy.definition.color,
        enemy.definition.radius * pixelRatio * 1.7,
      );
      this.addEvent("explosion", enemy.position.x, enemy.position.y);
    }
  }

  addImpact(x, y, color, radius) {
    this.impacts.push({
      x,
      y,
      color,
      radius,
      age: 0,
      lifetime: IMPACT_LIFETIME,
    });

    if (this.impacts.length > 72) {
      this.impacts.splice(0, this.impacts.length - 72);
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
      const progress = impact.age / impact.lifetime;
      const radius = impact.radius * (0.45 + progress);
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = impact.color;
      ctx.shadowColor = impact.color;
      ctx.shadowBlur = 14 * pixelRatio;
      ctx.lineWidth = Math.max(1.5, 3 * pixelRatio * (1 - progress));
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
