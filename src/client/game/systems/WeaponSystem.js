import {
  DEFAULT_WEAPON_LOADOUT,
  WEAPON_ORDER,
  WEAPON_TYPES,
} from "../data/weaponDefinitions.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.0001) {
    return { x: 0, y: -1, length: 0 };
  }
  return { x: x / length, y: y / length, length };
}

function rotateToward(current, target, maxRadians) {
  const currentAngle = Math.atan2(current.y, current.x);
  const targetAngle = Math.atan2(target.y, target.x);
  let delta = targetAngle - currentAngle;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  const nextAngle = currentAngle + clamp(delta, -maxRadians, maxRadians);
  return { x: Math.cos(nextAngle), y: Math.sin(nextAngle) };
}

function cleanNumber(value, fallback, min = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > min ? number : fallback;
}

function buildLoadout(equippedLoadout = {}) {
  return Object.fromEntries(
    WEAPON_ORDER.map((type) => {
      const base = DEFAULT_WEAPON_LOADOUT[type];
      const gear = equippedLoadout?.[type];
      const stats = gear?.stats || {};

      return [
        type,
        {
          ...base,
          label: gear?.name || base.label,
          damage: cleanNumber(stats.damage, base.damage),
          fireRate: cleanNumber(stats.fireRate, base.fireRate),
          speed: cleanNumber(stats.speed, base.speed),
          lifetime: cleanNumber(stats.lifetime, base.lifetime),
          radius: cleanNumber(stats.radius, base.radius),
          turnRate: cleanNumber(stats.turnRate, base.turnRate),
          chargeTime: cleanNumber(stats.chargeTime, base.chargeTime),
          beamDuration: cleanNumber(stats.beamDuration, base.beamDuration),
          range: cleanNumber(stats.range, base.range),
          width: cleanNumber(stats.width, base.width),
          color: gear?.rarityColor || base.color,
          equippedGearId: gear?.id || null,
        },
      ];
    }),
  );
}

export class WeaponSystem {
  constructor(loadout = DEFAULT_WEAPON_LOADOUT) {
    this.loadout = buildLoadout(loadout);
    this.selectedType = WEAPON_TYPES.projectile;
    this.cooldowns = Object.fromEntries(WEAPON_ORDER.map((type) => [type, 0]));
    this.projectiles = [];
    this.missiles = [];
    this.beams = [];
    this.muzzleFlashes = [];
    this.events = [];
    this.laserCharge = 0;
    this.chargeMount = null;
    this.status = this.getStatus();
  }

  setEquippedLoadout(equippedLoadout = {}) {
    this.loadout = buildLoadout(equippedLoadout);
    if (!this.loadout[this.selectedType]) {
      this.selectedType = WEAPON_TYPES.projectile;
    }
    this.reset();
  }

  reset() {
    this.cooldowns = Object.fromEntries(WEAPON_ORDER.map((type) => [type, 0]));
    this.projectiles = [];
    this.missiles = [];
    this.beams = [];
    this.muzzleFlashes = [];
    this.events = [];
    this.laserCharge = 0;
    this.chargeMount = null;
    this.status = this.getStatus();
  }

  update(dt, player, input, size) {
    this.applySelection(input.selectedWeapon);
    this.tickCooldowns(dt);

    const pixelRatio = size.pixelRatio;
    const selected = this.loadout[this.selectedType];
    const mount = player.getWeaponMount(pixelRatio);
    const aimDirection = this.getAimDirection(player, input.pointer, pixelRatio);
    this.chargeMount = mount;

    if (selected.type === WEAPON_TYPES.laser) {
      this.updateLaser(dt, selected, input, mount, aimDirection, pixelRatio);
    } else if (input.fireHeld && this.cooldowns[selected.type] <= 0) {
      if (selected.type === WEAPON_TYPES.projectile) {
        this.fireProjectile(selected, mount, aimDirection, pixelRatio);
      }

      if (selected.type === WEAPON_TYPES.missile) {
        this.fireMissile(selected, mount, aimDirection, input.pointer, pixelRatio);
      }

      this.cooldowns[selected.type] = 1 / selected.fireRate;
    }

    this.updateProjectiles(dt, size);
    this.updateMissiles(dt, size);
    this.updateBeams(dt);
    this.updateMuzzleFlashes(dt);
    this.status = this.getStatus();
  }

  applySelection(selection) {
    if (selection && this.loadout[selection]) {
      this.selectedType = selection;
      if (selection !== WEAPON_TYPES.laser) {
        this.laserCharge = 0;
      }
    }
  }

  tickCooldowns(dt) {
    for (const type of WEAPON_ORDER) {
      this.cooldowns[type] = Math.max(0, this.cooldowns[type] - dt);
    }
  }

  getAimDirection(player, pointer, pixelRatio) {
    if (pointer) {
      const mount = player.getWeaponMount(pixelRatio);
      return normalize(pointer.x - mount.x, pointer.y - mount.y);
    }

    return player.getForwardVector();
  }

  fireProjectile(definition, mount, direction, pixelRatio) {
    const speed = definition.speed * pixelRatio;
    this.projectiles.push({
      x: mount.x,
      y: mount.y,
      vx: direction.x * speed,
      vy: direction.y * speed,
      radius: definition.radius * pixelRatio,
      color: definition.color,
      damage: definition.damage,
      age: 0,
      lifetime: definition.lifetime,
    });
    this.addMuzzleFlash(mount, definition.color, 12 * pixelRatio);
    this.addEvent("shoot-projectile", mount.x, mount.y);
  }

  fireMissile(definition, mount, direction, pointer, pixelRatio) {
    const speed = definition.speed * pixelRatio;
    this.missiles.push({
      x: mount.x,
      y: mount.y,
      direction: { x: direction.x, y: direction.y },
      speed,
      radius: definition.radius * pixelRatio,
      color: definition.color,
      damage: definition.damage,
      age: 0,
      lifetime: definition.lifetime,
      turnRate: definition.turnRate,
      target: pointer ? { x: pointer.x, y: pointer.y } : null,
      trail: [],
    });
    this.addMuzzleFlash(mount, definition.color, 18 * pixelRatio);
    this.addEvent("shoot-missile", mount.x, mount.y);
  }

  updateLaser(dt, definition, input, mount, direction, pixelRatio) {
    if (input.fireHeld) {
      this.laserCharge = clamp(this.laserCharge + dt, 0, definition.chargeTime);
    }

    if (input.fireReleased && this.laserCharge > 0 && this.cooldowns[definition.type] <= 0) {
      const chargeRatio = clamp(this.laserCharge / definition.chargeTime, 0.2, 1);
      this.beams.push({
        x: mount.x,
        y: mount.y,
        direction,
        age: 0,
        lifetime: definition.beamDuration,
        range: definition.range * pixelRatio,
        width: definition.width * pixelRatio * chargeRatio,
        color: definition.color,
        damage: Math.round(definition.damage * chargeRatio),
      });
      this.cooldowns[definition.type] = 1 / definition.fireRate;
      this.laserCharge = 0;
      this.addMuzzleFlash(mount, definition.color, 22 * pixelRatio);
      this.addEvent("shoot-laser", mount.x, mount.y);
    }

    if (!input.fireHeld && !input.fireReleased) {
      this.laserCharge = Math.max(0, this.laserCharge - dt * 0.65);
    }
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
        projectile.x > -40 &&
        projectile.x < size.width + 40 &&
        projectile.y > -40 &&
        projectile.y < size.height + 40,
    );
  }

  updateMissiles(dt, size) {
    for (const missile of this.missiles) {
      if (missile.target) {
        const desired = normalize(missile.target.x - missile.x, missile.target.y - missile.y);
        missile.direction = rotateToward(missile.direction, desired, missile.turnRate * dt);
      }

      missile.trail.push({ x: missile.x, y: missile.y, age: 0 });
      if (missile.trail.length > 16) {
        missile.trail.shift();
      }
      for (const point of missile.trail) {
        point.age += dt;
      }

      missile.x += missile.direction.x * missile.speed * dt;
      missile.y += missile.direction.y * missile.speed * dt;
      missile.age += dt;
    }

    this.missiles = this.missiles.filter(
      (missile) =>
        missile.age < missile.lifetime &&
        missile.x > -80 &&
        missile.x < size.width + 80 &&
        missile.y > -80 &&
        missile.y < size.height + 80,
    );
  }

  updateBeams(dt) {
    for (const beam of this.beams) {
      beam.age += dt;
    }
    this.beams = this.beams.filter((beam) => beam.age < beam.lifetime);
  }

  updateMuzzleFlashes(dt) {
    for (const flash of this.muzzleFlashes) {
      flash.age += dt;
    }
    this.muzzleFlashes = this.muzzleFlashes.filter((flash) => flash.age < flash.lifetime);
  }

  addMuzzleFlash(mount, color, radius) {
    this.muzzleFlashes.push({
      x: mount.x,
      y: mount.y,
      color,
      radius,
      age: 0,
      lifetime: 0.11,
    });

    if (this.muzzleFlashes.length > 24) {
      this.muzzleFlashes.splice(0, this.muzzleFlashes.length - 24);
    }
  }

  addEvent(type, x, y) {
    this.events.push({ type, x, y });
    if (this.events.length > 32) {
      this.events.splice(0, this.events.length - 32);
    }
  }

  consumeEvents() {
    return this.events.splice(0);
  }

  draw(ctx, pixelRatio) {
    this.drawBeams(ctx);
    this.drawProjectiles(ctx);
    this.drawMissiles(ctx);
    this.drawMuzzleFlashes(ctx, pixelRatio);
    this.drawLaserCharge(ctx, pixelRatio);
  }

  drawProjectiles(ctx) {
    for (const projectile of this.projectiles) {
      const alpha = 1 - projectile.age / projectile.lifetime;
      ctx.fillStyle = projectile.color;
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  drawMissiles(ctx) {
    for (const missile of this.missiles) {
      missile.trail.forEach((point, index) => {
        const alpha = (index + 1) / missile.trail.length;
        ctx.fillStyle = `rgba(255, 138, 61, ${alpha * 0.35})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, missile.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
      });

      const angle = Math.atan2(missile.direction.y, missile.direction.x) + Math.PI / 2;
      ctx.save();
      ctx.translate(missile.x, missile.y);
      ctx.rotate(angle);
      ctx.fillStyle = missile.color;
      ctx.beginPath();
      ctx.moveTo(0, -missile.radius * 1.6);
      ctx.lineTo(missile.radius, missile.radius * 1.4);
      ctx.lineTo(0, missile.radius * 0.7);
      ctx.lineTo(-missile.radius, missile.radius * 1.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawBeams(ctx) {
    for (const beam of this.beams) {
      const alpha = 1 - beam.age / beam.lifetime;
      const endX = beam.x + beam.direction.x * beam.range;
      const endY = beam.y + beam.direction.y * beam.range;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = beam.color;
      ctx.shadowColor = beam.color;
      ctx.shadowBlur = 22;
      ctx.lineWidth = beam.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.globalAlpha = Math.min(1, alpha + 0.25);
      ctx.lineWidth = Math.max(2, beam.width * 0.35);
      ctx.strokeStyle = "#f7f8fb";
      ctx.stroke();
      ctx.restore();
    }
  }

  drawMuzzleFlashes(ctx, pixelRatio) {
    for (const flash of this.muzzleFlashes) {
      const progress = flash.age / flash.lifetime;
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.fillStyle = flash.color;
      ctx.shadowColor = flash.color;
      ctx.shadowBlur = 16 * pixelRatio;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, flash.radius * (1 - progress * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawLaserCharge(ctx, pixelRatio) {
    const laser = this.loadout[WEAPON_TYPES.laser];
    if (this.selectedType !== WEAPON_TYPES.laser || this.laserCharge <= 0 || !this.chargeMount) {
      return;
    }

    const charge = clamp(this.laserCharge / laser.chargeTime, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.25 + charge * 0.45;
    ctx.strokeStyle = laser.color;
    ctx.lineWidth = 2 * pixelRatio;
    ctx.beginPath();
    ctx.arc(
      this.chargeMount.x,
      this.chargeMount.y,
      10 * pixelRatio + charge * 12 * pixelRatio,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }

  getStatus() {
    const selected = this.loadout[this.selectedType];
    const charge =
      selected.type === WEAPON_TYPES.laser
        ? clamp(this.laserCharge / selected.chargeTime, 0, 1)
        : 0;

    return {
      type: selected.type,
      label: selected.label,
      damage: selected.damage,
      cooldown: this.cooldowns[selected.type],
      charge,
      activeCount: this.projectiles.length + this.missiles.length + this.beams.length,
    };
  }
}
