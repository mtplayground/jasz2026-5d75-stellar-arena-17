export const WEAPON_TYPES = {
  projectile: "projectile",
  missile: "missile",
  laser: "laser",
};

export const WEAPON_ORDER = [WEAPON_TYPES.projectile, WEAPON_TYPES.missile, WEAPON_TYPES.laser];

export const DEFAULT_WEAPON_LOADOUT = {
  [WEAPON_TYPES.projectile]: {
    type: WEAPON_TYPES.projectile,
    label: "Projectile",
    damage: 8,
    fireRate: 8.5,
    speed: 900,
    lifetime: 1.15,
    radius: 3.5,
    color: "#d9f45f",
  },
  [WEAPON_TYPES.missile]: {
    type: WEAPON_TYPES.missile,
    label: "Missile",
    damage: 28,
    fireRate: 1.35,
    speed: 420,
    turnRate: 5.8,
    lifetime: 2.8,
    radius: 6,
    color: "#ff8a3d",
  },
  [WEAPON_TYPES.laser]: {
    type: WEAPON_TYPES.laser,
    label: "Laser",
    damage: 42,
    fireRate: 0.75,
    chargeTime: 0.9,
    beamDuration: 0.18,
    range: 920,
    width: 9,
    color: "#72d8ff",
  },
};
