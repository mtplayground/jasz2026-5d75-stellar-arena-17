import { ENEMY_TYPES } from "./enemyDefinitions.js";

export const LEVEL_DEFINITIONS = [
  {
    id: "level-1",
    number: 1,
    label: "Level 1",
    waves: [
      {
        label: "Wave 1",
        startDelay: 0.35,
        spawnInterval: 0.95,
        maxActive: 4,
        enemies: [
          ENEMY_TYPES.scout,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.scout,
        ],
      },
      {
        label: "Wave 2",
        startDelay: 1.3,
        spawnInterval: 0.82,
        maxActive: 5,
        enemies: [
          ENEMY_TYPES.scout,
          ENEMY_TYPES.striker,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.striker,
        ],
      },
      {
        label: "Wave 3",
        startDelay: 1.45,
        spawnInterval: 0.7,
        maxActive: 6,
        enemies: [
          ENEMY_TYPES.striker,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.striker,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.striker,
        ],
      },
    ],
  },
];

export const DEFAULT_LEVEL_ID = LEVEL_DEFINITIONS[0].id;

export function getLevelDefinition(levelId = DEFAULT_LEVEL_ID) {
  return LEVEL_DEFINITIONS.find((level) => level.id === levelId) || LEVEL_DEFINITIONS[0];
}
