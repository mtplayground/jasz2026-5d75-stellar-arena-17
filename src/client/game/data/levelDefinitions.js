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
  {
    id: "level-2",
    number: 2,
    label: "Level 2",
    waves: [
      {
        label: "Wave 1",
        startDelay: 0.35,
        spawnInterval: 0.78,
        maxActive: 5,
        enemies: [
          ENEMY_TYPES.scout,
          ENEMY_TYPES.striker,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.striker,
          ENEMY_TYPES.scout,
        ],
      },
      {
        label: "Wave 2",
        startDelay: 1.15,
        spawnInterval: 0.62,
        maxActive: 6,
        enemies: [
          ENEMY_TYPES.striker,
          ENEMY_TYPES.striker,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.striker,
          ENEMY_TYPES.scout,
        ],
      },
      {
        label: "Wave 3",
        startDelay: 1.35,
        spawnInterval: 0.55,
        maxActive: 7,
        enemies: [
          ENEMY_TYPES.striker,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.striker,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.striker,
          ENEMY_TYPES.scout,
          ENEMY_TYPES.striker,
        ],
      },
    ],
  },
];

export const DEFAULT_LEVEL_ID = LEVEL_DEFINITIONS[0].id;
export const MAX_LEVEL_NUMBER = Math.max(...LEVEL_DEFINITIONS.map((level) => level.number));

export function getLevelDefinition(levelId = DEFAULT_LEVEL_ID) {
  return LEVEL_DEFINITIONS.find((level) => level.id === levelId) || LEVEL_DEFINITIONS[0];
}

export function getLevelDefinitionForNumber(levelNumber = 1) {
  return LEVEL_DEFINITIONS.find((level) => level.number === levelNumber) || LEVEL_DEFINITIONS[0];
}

export function getNextLevelNumber(highestClearedLevel = 0) {
  return Math.min(MAX_LEVEL_NUMBER, Math.max(1, highestClearedLevel + 1));
}
