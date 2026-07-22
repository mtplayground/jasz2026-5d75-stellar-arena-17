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

function colorWithAlpha(color, alpha) {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
  }

  return color;
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
          pelletCount: Math.max(1, Math.round(cleanNumber(stats.pelletCount, base.pelletCount || 1, 0))),
          spreadAngle: cleanNumber(stats.spreadAngle, base.spreadAngle || 0, -1),
          turnRate: cleanNumber(stats.turnRate, base.turnRate),
          proximityRadius: cleanNumber(stats.proximityRadius, base.proximityRadius),
          blastRadius: cleanNumber(stats.blastRadius, base.blastRadius),
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
    this.status = this.getStatus();
  }

  update(dt, player, input, size) {
    this.applySelection(input.selectedWeapon);
    this.tickCooldowns(dt);

    const pixelRatio = size.pixelRatio;
    const selected = this.loadout[this.selectedType];
    const mount = player.getWeaponMount(pixelRatio);
    const aimDirection = this.getAimDirection(player, input.pointer, pixelRatio);
    if (selected.type === WEAPON_TYPES.laser) {
      this.updateLaser(selected, input, mount, aimDirection, pixelRatio);
    } else if (input.fireHeld && this.cooldowns[selected.type] <= 0) {
      if (selected.type === WEAPON_TYPES.projectile) {
        this.fireProjectile(selected, mount, aimDirection, pixelRatio);
      }

      if (selected.type === WEAPON_TYPES.missile) {
        this.fireMissile(selected, mount, aimDirection, input.pointer, pixelRatio);
      }

      if (selected.type === WEAPON_TYPES.shotgun) {
        this.fireShotgun(selected, mount, aimDirection, pixelRatio);
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
    this.addMuzzleFlash(mount, definition.color, 18 * pixelRatio, { intensity: 1.15 });
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
      proximityRadius: definition.proximityRadius * pixelRatio,
      blastRadius: definition.blastRadius * pixelRatio,
      color: definition.color,
      damage: definition.damage,
      age: 0,
      lifetime: definition.lifetime,
      turnRate: definition.turnRate,
      target: pointer ? { x: pointer.x, y: pointer.y } : null,
      trail: [],
    });
    this.addMuzzleFlash(mount, definition.color, 28 * pixelRatio, { intensity: 1.35, lifetime: 0.18 });
    this.addEvent("shoot-missile", mount.x, mount.y);
  }

  fireShotgun(definition, mount, direction, pixelRatio) {
    const speed = definition.speed * pixelRatio;
    const radius = definition.radius * pixelRatio;
    const pelletCount = Math.max(1, Math.round(definition.pelletCount || 1));
    const spreadAngle = Math.max(0, definition.spreadAngle || 0);
    const startAngle = Math.atan2(direction.y, direction.x) - spreadAngle / 2;
    const step = pelletCount > 1 ? spreadAngle / (pelletCount - 1) : 0;

    for (let index = 0; index < pelletCount; index += 1) {
      const pelletAngle = startAngle + step * index;
      const pelletDirection = {
        x: Math.cos(pelletAngle),
        y: Math.sin(pelletAngle),
      };
      this.projectiles.push({
        x: mount.x,
        y: mount.y,
        vx: pelletDirection.x * speed,
        vy: pelletDirection.y * speed,
        radius,
        color: definition.color,
        damage: definition.damage,
        age: 0,
        lifetime: definition.lifetime,
      });
    }

    this.addMuzzleFlash(mount, definition.color, 38 * pixelRatio, {
      intensity: 1.75,
      lifetime: 0.17,
      burst: true,
    });
    this.addEvent("shoot-shotgun", mount.x, mount.y);
  }

  updateLaser(definition, input, mount, direction, pixelRatio) {
    if (!input.fireHeld || this.cooldowns[definition.type] > 0) {
      return;
    }

    this.beams.push({
      x: mount.x,
      y: mount.y,
      direction,
      age: 0,
      lifetime: definition.beamDuration,
      range: definition.range * pixelRatio,
      width: definition.width * pixelRatio,
      color: definition.color,
      damage: definition.damage,
    });
    this.cooldowns[definition.type] = 1 / definition.fireRate;
    this.addMuzzleFlash(mount, definition.color, 34 * pixelRatio, { intensity: 1.45, lifetime: 0.16 });
    this.addEvent("shoot-laser", mount.x, mount.y);
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

  addMuzzleFlash(mount, color, radius, options = {}) {
    this.muzzleFlashes.push({
      x: mount.x,
      y: mount.y,
      color,
      radius,
      intensity: options.intensity || 1,
      burst: Boolean(options.burst),
      age: 0,
      lifetime: options.lifetime || 0.15,
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
  }

  drawProjectiles(ctx) {
    for (const projectile of this.projectiles) {
      const alpha = 1 - projectile.age / projectile.lifetime;
      const haloRadius = projectile.radius * 4.2;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.74;
      const halo = ctx.createRadialGradient(
        projectile.x,
        projectile.y,
        projectile.radius,
        projectile.x,
        projectile.y,
        haloRadius,
      );
      halo.addColorStop(0, colorWithAlpha(projectile.color, 0.72));
      halo.addColorStop(0.46, colorWithAlpha(projectile.color, 0.22));
      halo.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.fillStyle = projectile.color;
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius * 1.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = Math.min(1, alpha + 0.2);
      ctx.fillStyle = "#f7f8fb";
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, Math.max(1, projectile.radius * 0.42), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawMissiles(ctx) {
    for (const missile of this.missiles) {
      this.drawMissileTrail(ctx, missile);

      const angle = Math.atan2(missile.direction.y, missile.direction.x) + Math.PI / 2;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(missile.x, missile.y);
      ctx.rotate(angle);
      ctx.fillStyle = missile.color;
      ctx.shadowColor = missile.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(0, -missile.radius * 1.6);
      ctx.lineTo(missile.radius, missile.radius * 1.4);
      ctx.lineTo(0, missile.radius * 0.7);
      ctx.lineTo(-missile.radius, missile.radius * 1.4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fff0d8";
      ctx.beginPath();
      ctx.moveTo(0, -missile.radius * 0.9);
      ctx.lineTo(missile.radius * 0.32, missile.radius * 0.78);
      ctx.lineTo(0, missile.radius * 0.44);
      ctx.lineTo(-missile.radius * 0.32, missile.radius * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawMissileTrail(ctx, missile) {
    if (missile.trail.length < 2) {
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let index = 1; index < missile.trail.length; index += 1) {
      const previous = missile.trail[index - 1];
      const current = missile.trail[index];
      const alpha = index / missile.trail.length;
      const width = missile.radius * (0.65 + alpha * 1.65);
      const gradient = ctx.createLinearGradient(previous.x, previous.y, current.x, current.y);
      gradient.addColorStop(0, `rgba(255, 88, 45, ${alpha * 0.05})`);
      gradient.addColorStop(0.45, `rgba(255, 138, 61, ${alpha * 0.3})`);
      gradient.addColorStop(1, `rgba(255, 222, 124, ${alpha * 0.62})`);

      ctx.globalAlpha = 1;
      ctx.strokeStyle = gradient;
      ctx.shadowColor = "#ff8a3d";
      ctx.shadowBlur = 18 * alpha;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }

    const newest = missile.trail[missile.trail.length - 1];
    ctx.fillStyle = "rgba(255, 222, 124, 0.42)";
    ctx.shadowColor = "#ffcf5f";
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(newest.x, newest.y, missile.radius * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawBeams(ctx) {
    for (const beam of this.beams) {
      const alpha = 1 - beam.age / beam.lifetime;
      const endX = beam.x + beam.direction.x * beam.range;
      const endY = beam.y + beam.direction.y * beam.range;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.46;
      ctx.strokeStyle = beam.color;
      ctx.shadowColor = beam.color;
      ctx.shadowBlur = 34;
      ctx.lineWidth = beam.width * 3.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.globalAlpha = alpha * 0.82;
      ctx.strokeStyle = beam.color;
      ctx.shadowBlur = 18;
      ctx.lineWidth = beam.width * 1.45;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.globalAlpha = Math.min(1, alpha + 0.32);
      ctx.shadowBlur = 8;
      ctx.lineWidth = Math.max(2, beam.width * 0.42);
      ctx.strokeStyle = "#f7f8fb";
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawMuzzleFlashes(ctx, pixelRatio) {
    for (const flash of this.muzzleFlashes) {
      const progress = flash.age / flash.lifetime;
      const fade = 1 - progress;
      const radius = flash.radius * (1 - progress * 0.42);
      const bloomRadius = radius * (flash.burst ? 1.35 : 1.05);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade;
      ctx.shadowColor = flash.color;
      ctx.shadowBlur = 24 * pixelRatio * flash.intensity;

      const bloom = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, bloomRadius);
      bloom.addColorStop(0, "rgba(255, 255, 255, 0.92)");
      bloom.addColorStop(0.28, colorWithAlpha(flash.color, 0.7));
      bloom.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, bloomRadius, 0, Math.PI * 2);
      ctx.fill();

      if (flash.burst) {
        ctx.globalAlpha = fade * 0.82;
        ctx.strokeStyle = colorWithAlpha(flash.color, 0.76);
        ctx.lineWidth = Math.max(1, 2.2 * pixelRatio);
        for (let index = 0; index < 8; index += 1) {
          const angle = (Math.PI * 2 * index) / 8;
          const inner = radius * 0.28;
          const outer = radius * (0.72 + progress * 0.25);
          ctx.beginPath();
          ctx.moveTo(flash.x + Math.cos(angle) * inner, flash.y + Math.sin(angle) * inner);
          ctx.lineTo(flash.x + Math.cos(angle) * outer, flash.y + Math.sin(angle) * outer);
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }

  getStatus() {
    const selected = this.loadout[this.selectedType];

    return {
      type: selected.type,
      label: selected.label,
      damage: selected.damage,
      pelletCount: selected.pelletCount || 1,
      cooldown: this.cooldowns[selected.type],
      charge: 0,
      activeCount: this.projectiles.length + this.missiles.length + this.beams.length,
    };
  }
}
