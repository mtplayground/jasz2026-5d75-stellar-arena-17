export const ENEMY_TYPES = {
  scout: "scout",
  striker: "striker",
};

export const ENEMY_SPAWN_SEQUENCE = [
  ENEMY_TYPES.scout,
  ENEMY_TYPES.scout,
  ENEMY_TYPES.striker,
  ENEMY_TYPES.scout,
  ENEMY_TYPES.striker,
];

export const ENEMY_DEFINITIONS = {
  [ENEMY_TYPES.scout]: {
    type: ENEMY_TYPES.scout,
    label: "Scout",
    speed: 110,
    driftAmplitude: 82,
    driftFrequency: 2.3,
    fireInterval: 1.35,
    projectileSpeed: 280,
    projectileRadius: 4,
    projectileDamage: 10,
    projectileColor: "#ff6b7a",
    radius: 24,
    health: 35,
    collisionDamage: 22,
    scoreValue: 10,
    color: "#ff6b7a",
  },
  [ENEMY_TYPES.striker]: {
    type: ENEMY_TYPES.striker,
    label: "Striker",
    speed: 72,
    driftAmplitude: 34,
    driftFrequency: 1.4,
    tracking: 1.15,
    fireInterval: 2.15,
    burstCount: 3,
    burstSpread: 0.2,
    projectileSpeed: 235,
    projectileRadius: 5,
    projectileDamage: 14,
    projectileColor: "#b47cff",
    radius: 32,
    health: 70,
    collisionDamage: 34,
    scoreValue: 25,
    color: "#b47cff",
  },
};
