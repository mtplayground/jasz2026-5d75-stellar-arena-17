import { DEFAULT_LEVEL_ID, getLevelDefinition } from "../data/levelDefinitions.js";

export class LevelSystem {
  constructor(levelId = DEFAULT_LEVEL_ID) {
    this.level = getLevelDefinition(levelId);
    this.reset(levelId);
  }

  reset(levelId = this.level.id) {
    this.level = getLevelDefinition(levelId);
    this.waveIndex = 0;
    this.spawnIndex = 0;
    this.waveTimer = this.currentWave().startDelay;
    this.spawnTimer = 0;
    this.levelClear = false;
    this.status = this.createStatus("Preparing");
  }

  currentWave() {
    return this.level.waves[this.waveIndex];
  }

  update(dt, enemies, size) {
    if (this.levelClear) {
      this.status = this.createStatus("Level Clear");
      return;
    }

    const wave = this.currentWave();
    if (!wave) {
      this.evaluateClear(enemies);
      return;
    }

    if (this.waveTimer > 0) {
      this.waveTimer = Math.max(0, this.waveTimer - dt);
      this.status = this.createStatus("Preparing");
      return;
    }

    if (this.spawnIndex < wave.enemies.length) {
      this.spawnTimer -= dt;

      if (this.spawnTimer <= 0 && enemies.enemies.length < wave.maxActive) {
        enemies.spawnEnemy(size, wave.enemies[this.spawnIndex]);
        this.spawnIndex += 1;
        this.spawnTimer = wave.spawnInterval;
      }

      this.status = this.createStatus("In Progress");
      return;
    }

    this.evaluateClear(enemies);
  }

  evaluateClear(enemies) {
    if (this.levelClear) {
      this.status = this.createStatus("Level Clear");
      return;
    }

    const waveDone =
      this.spawnIndex >= this.currentWave().enemies.length &&
      enemies.enemies.length === 0 &&
      enemies.projectiles.length === 0;

    if (!waveDone) {
      this.status = this.createStatus("In Progress");
      return;
    }

    if (this.waveIndex >= this.level.waves.length - 1) {
      this.levelClear = true;
      this.status = this.createStatus("Level Clear");
      return;
    }

    this.waveIndex += 1;
    this.spawnIndex = 0;
    this.waveTimer = this.currentWave().startDelay;
    this.spawnTimer = 0;
    this.status = this.createStatus("Preparing");
  }

  createStatus(state) {
    const wave = this.currentWave() || this.level.waves[this.level.waves.length - 1];
    return {
      levelLabel: this.level.label,
      levelNumber: this.level.number,
      waveLabel: wave.label,
      waveNumber: this.waveIndex + 1,
      totalWaves: this.level.waves.length,
      enemiesSpawned: Math.min(this.spawnIndex, wave.enemies.length),
      enemiesTotal: wave.enemies.length,
      state,
      levelClear: this.levelClear,
    };
  }
}
