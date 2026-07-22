export const GEAR_WEAPON_TYPES = {
  projectile: "projectile",
  missile: "missile",
  laser: "laser",
  shotgun: "shotgun",
};

export const RARITY_TIERS = [
  {
    id: "common",
    label: "Common",
    colorName: "White",
    rank: 1,
    color: "#f7f8fb",
    multiplier: 1,
  },
  {
    id: "uncommon",
    label: "Uncommon",
    colorName: "Green",
    rank: 2,
    color: "#38d985",
    multiplier: 1.18,
  },
  {
    id: "rare",
    label: "Rare",
    colorName: "Blue",
    rank: 3,
    color: "#4aa8ff",
    multiplier: 1.38,
  },
  {
    id: "epic",
    label: "Epic",
    colorName: "Purple",
    rank: 4,
    color: "#b47cff",
    multiplier: 1.62,
  },
  {
    id: "legendary",
    label: "Legendary",
    colorName: "Orange",
    rank: 5,
    color: "#ff9f3d",
    multiplier: 1.95,
  },
];

export const RARITY_DROP_WEIGHTS = {
  common: 55,
  uncommon: 27,
  rare: 12,
  epic: 5,
  legendary: 1,
};

const BASE_GEAR = {
  [GEAR_WEAPON_TYPES.projectile]: {
    name: "Pulse Cannon",
    stats: {
      damage: 8,
      fireRate: 8.5,
      speed: 900,
      radius: 3.5,
    },
  },
  [GEAR_WEAPON_TYPES.missile]: {
    name: "Seeker Pod",
    stats: {
      damage: 28,
      fireRate: 1.35,
      speed: 420,
      turnRate: 5.8,
      radius: 6,
      proximityRadius: 56,
      blastRadius: 72,
    },
  },
  [GEAR_WEAPON_TYPES.laser]: {
    name: "Lance Emitter",
    stats: {
      damage: 26,
      fireRate: 1.15,
      beamDuration: 0.16,
      range: 920,
      width: 8,
    },
  },
  [GEAR_WEAPON_TYPES.shotgun]: {
    name: "Scatter Blaster",
    stats: {
      damage: 6,
      pelletCount: 6,
      spreadAngle: 0.58,
      fireRate: 1.65,
      speed: 760,
      lifetime: 0.74,
      radius: 3.2,
    },
  },
};

function roundStat(value) {
  return Number.isInteger(value) ? value : Number(value.toFixed(2));
}

function scaleStats(weaponType, baseStats, multiplier) {
  const stats = {};

  for (const [key, value] of Object.entries(baseStats)) {
    if (key === "beamDuration" || key === "spreadAngle" || key === "lifetime") {
      stats[key] = value;
    } else if (key === "pelletCount") {
      stats[key] = Math.max(value, Math.round(value + (multiplier - 1) * 2));
    } else {
      stats[key] = roundStat(value * multiplier);
    }
  }

  if (weaponType === GEAR_WEAPON_TYPES.projectile) {
    stats.fireRate = roundStat(baseStats.fireRate * (1 + (multiplier - 1) * 0.55));
  }

  if (weaponType === GEAR_WEAPON_TYPES.missile) {
    stats.turnRate = roundStat(baseStats.turnRate * (1 + (multiplier - 1) * 0.4));
    stats.proximityRadius = roundStat(baseStats.proximityRadius * (1 + (multiplier - 1) * 0.5));
    stats.blastRadius = roundStat(baseStats.blastRadius * (1 + (multiplier - 1) * 0.65));
  }

  if (weaponType === GEAR_WEAPON_TYPES.laser) {
    stats.fireRate = roundStat(baseStats.fireRate * (1 + (multiplier - 1) * 0.45));
    stats.range = roundStat(baseStats.range * (1 + (multiplier - 1) * 0.22));
    stats.width = roundStat(baseStats.width * (1 + (multiplier - 1) * 0.18));
  }

  if (weaponType === GEAR_WEAPON_TYPES.shotgun) {
    stats.fireRate = roundStat(baseStats.fireRate * (1 + (multiplier - 1) * 0.45));
    stats.speed = roundStat(baseStats.speed * (1 + (multiplier - 1) * 0.35));
  }

  return stats;
}

export const GEAR_DEFINITIONS = Object.values(GEAR_WEAPON_TYPES).flatMap((weaponType) => {
  const base = BASE_GEAR[weaponType];

  return RARITY_TIERS.map((rarity) => ({
    id: `${weaponType}-${rarity.id}`,
    name: `${rarity.label} ${base.name}`,
    weaponType,
    rarity: rarity.id,
    rarityLabel: rarity.label,
    rarityColorName: rarity.colorName,
    rarityColor: rarity.color,
    rarityRank: rarity.rank,
    stats: scaleStats(weaponType, base.stats, rarity.multiplier),
  }));
});

export function rarityById(rarityId) {
  return RARITY_TIERS.find((rarity) => rarity.id === rarityId) || RARITY_TIERS[0];
}
