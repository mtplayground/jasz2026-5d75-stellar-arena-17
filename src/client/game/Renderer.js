import { PlayerJet } from "./entities/PlayerJet.js";
import { getNextLevelNumber, MAX_LEVEL_NUMBER } from "./data/levelDefinitions.js";
import { CombatSystem } from "./systems/CombatSystem.js";
import { EnemySystem } from "./systems/EnemySystem.js";
import { LevelSystem } from "./systems/LevelSystem.js";
import { SoundSystem } from "./systems/SoundSystem.js";
import { WeaponSystem } from "./systems/WeaponSystem.js";

export class Renderer {
  constructor(canvas, viewport, input, hud = {}) {
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Canvas 2D context is not available");
    }

    this.canvas = canvas;
    this.viewport = viewport;
    this.input = input;
    this.hud = hud;
    this.context = context;
    this.starLayers = this.createStarLayers();
    this.player = new PlayerJet();
    this.enemies = new EnemySystem();
    this.level = new LevelSystem();
    this.weapons = new WeaponSystem();
    this.combat = new CombatSystem();
    this.sound = new SoundSystem();
    this.screenShake = 0;
    this.wasGameActive = false;
    this.highestClearedLevel = 0;
    this.currentLevelNumber = 1;
    this.resultState = {
      visible: false,
      outcome: null,
      saving: false,
      saved: false,
      drop: null,
    };
    this.bindResultControls();
  }

  createStarLayers() {
    return Array.from({ length: 72 }, (_, index) => {
      const layer = index % 3;
      return {
        x: (index * 131) % 1920,
        y: (index * 337) % 1080,
        radius: 0.8 + layer * 0.55,
        speed: 24 + layer * 28,
        alpha: 0.38 + layer * 0.18,
      };
    });
  }

  update(dt) {
    const { width, height } = this.viewport.size;
    this.screenShake = Math.max(0, this.screenShake - dt);

    for (const star of this.starLayers) {
      star.y += star.speed * dt;

      if (star.y > height + 8) {
        star.y = -8;
        star.x = (star.x + width * 0.37 + star.speed * 3) % width;
      }
    }

    const gameActive = this.input.isFlightEnabled();

    if (gameActive && !this.wasGameActive) {
      this.startRun(this.getNextPlayableLevelNumber());
    }

    this.player.update(dt, this.input.getFlightInput(), this.viewport.size);

    if (gameActive) {
      if (!this.player.gameOver && !this.level.levelClear) {
        this.level.update(dt, this.enemies, this.viewport.size);
        this.enemies.update(dt, this.player, this.viewport.size);
        this.weapons.update(dt, this.player, this.input.getWeaponInput(), this.viewport.size);
      }

      this.combat.update(dt, {
        player: this.player,
        enemies: this.enemies,
        weapons: this.weapons,
        size: this.viewport.size,
      });
      this.handleFeedbackEvents([...this.weapons.consumeEvents(), ...this.combat.consumeEvents()]);
      if (!this.player.gameOver) {
        this.level.evaluateClear(this.enemies);
      }
      this.resolveResultState();
      this.wasGameActive = true;
    } else if (this.wasGameActive) {
      this.enemies.reset();
      this.level.reset();
      this.weapons.reset();
      this.combat.reset();
      this.hideResult();
      this.wasGameActive = false;
    }

    this.updateWeaponStatus();
    this.updateLevelStatus();
    this.updateCombatStatus(gameActive);
  }

  render(alpha) {
    const { width, height } = this.viewport.size;
    const ctx = this.context;

    ctx.clearRect(0, 0, width, height);
    const shake = this.screenShake > 0 ? this.screenShake * this.viewport.size.pixelRatio : 0;
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    this.drawBackground(ctx, width, height);
    this.drawStars(ctx);
    this.drawPointerReticle(ctx);
    this.enemies.draw(ctx, alpha, this.viewport.size.pixelRatio);
    this.weapons.draw(ctx, this.viewport.size.pixelRatio);
    this.combat.draw(ctx, this.viewport.size.pixelRatio);
    this.player.draw(ctx, alpha, this.viewport.size.pixelRatio);
    ctx.restore();
  }

  updateWeaponStatus() {
    if (!this.hud.weaponStatus) {
      return;
    }

    const status = this.weapons.status;
    const charge = status.charge > 0 ? ` ${Math.round(status.charge * 100)}%` : "";
    this.hud.weaponStatus.textContent = `${status.label}${charge}`;
    if (this.hud.weaponDetail) {
      const damageText =
        status.pelletCount > 1
          ? `${status.pelletCount} x ${status.damage} dmg`
          : `${status.damage} dmg`;
      this.hud.weaponDetail.textContent = damageText;
    }
  }

  updateCombatStatus(gameActive) {
    if (this.hud.healthStatus) {
      this.hud.healthStatus.textContent = `${Math.ceil(this.player.health)}/${this.player.maxHealth}`;
    }

    if (this.hud.healthMeter) {
      const healthRatio = this.player.maxHealth > 0 ? this.player.health / this.player.maxHealth : 0;
      this.hud.healthMeter.style.setProperty("--health-ratio", String(Math.max(0, Math.min(1, healthRatio))));
    }

    if (this.hud.livesStatus) {
      this.hud.livesStatus.textContent = String(this.player.lives);
    }

    if (this.hud.combatStatus) {
      if (this.player.gameOver) {
        this.hud.combatStatus.textContent = "Game Over";
      } else if (this.level.levelClear) {
        this.hud.combatStatus.textContent = "Level Clear";
      } else if (!gameActive) {
        this.hud.combatStatus.textContent = "Ready";
      } else if (this.player.invulnerability > 0) {
        this.hud.combatStatus.textContent = "Recovering";
      } else {
        this.hud.combatStatus.textContent = "Engaged";
      }
    }
  }

  bindResultControls() {
    if (this.hud.resultPrimary) {
      this.hud.resultPrimary.addEventListener("click", () => {
        if (this.resultState.outcome === "victory") {
          this.startRun(this.getNextPlayableLevelNumber());
        } else {
          this.startRun(this.currentLevelNumber);
        }
      });
    }

    if (this.hud.resultMenu) {
      this.hud.resultMenu.addEventListener("click", () => {
        this.hideResult();
        window.location.hash = "menu";
      });
    }
  }

  setPlayerProgress(player) {
    const highestClearedLevel = Number.parseInt(String(player?.highestClearedLevel || "0"), 10);
    this.highestClearedLevel = Number.isFinite(highestClearedLevel)
      ? Math.max(0, highestClearedLevel)
      : 0;
  }

  setEquippedLoadout(equippedLoadout) {
    this.weapons.setEquippedLoadout(equippedLoadout || {});
  }

  handleFeedbackEvents(events) {
    for (const event of events) {
      this.sound.play(event.type);
      if (event.type === "player-hit") {
        this.screenShake = Math.max(this.screenShake, 8);
      }
      if (event.type === "explosion") {
        this.screenShake = Math.max(this.screenShake, 5);
      }
    }
  }

  getNextPlayableLevelNumber() {
    return getNextLevelNumber(this.highestClearedLevel);
  }

  startRun(levelNumber) {
    this.currentLevelNumber = Math.min(MAX_LEVEL_NUMBER, Math.max(1, levelNumber));
    this.player.resetCombatState(this.viewport.size);
    this.enemies.reset();
    this.level.resetToLevelNumber(this.currentLevelNumber);
    this.weapons.reset();
    this.combat.reset();
    this.hideResult();
    this.wasGameActive = true;
  }

  resolveResultState() {
    if (this.resultState.visible) {
      return;
    }

    if (this.level.levelClear) {
      this.showVictory();
      return;
    }

    if (this.player.gameOver) {
      this.showDefeat();
    }
  }

  showVictory() {
    this.resultState = {
      visible: true,
      outcome: "victory",
      saving: true,
      saved: false,
      drop: null,
    };
    this.setResultContent({
      label: "Victory",
      title: `${this.level.status.levelLabel} Clear`,
      summary: "Saving progress.",
      primary: this.currentLevelNumber >= MAX_LEVEL_NUMBER ? "Replay" : "Continue",
    });
    this.saveProgress(this.currentLevelNumber);
  }

  showDefeat() {
    this.resultState = {
      visible: true,
      outcome: "defeat",
      saving: false,
      saved: false,
      drop: null,
    };
    this.setResultContent({
      label: "Defeat",
      title: "Jet Destroyed",
      summary: `Retry ${this.level.status.levelLabel}.`,
      primary: "Retry",
    });
  }

  hideResult() {
    this.resultState.visible = false;
    this.resultState.outcome = null;
    this.resultState.saving = false;
    this.resultState.drop = null;
    if (this.hud.resultScreen) {
      this.hud.resultScreen.hidden = true;
      this.canvas.closest(".app-shell")?.removeAttribute("data-result-visible");
    }
    this.hideLootReveal();
    if (this.hud.resultPrimary) {
      this.hud.resultPrimary.disabled = false;
    }
  }

  setResultContent({ label, title, summary, primary }) {
    if (this.hud.resultScreen) {
      this.hud.resultScreen.hidden = false;
      this.canvas.closest(".app-shell")?.setAttribute("data-result-visible", "true");
    }
    if (this.hud.resultLabel) this.hud.resultLabel.textContent = label;
    if (this.hud.resultTitle) this.hud.resultTitle.textContent = title;
    if (this.hud.resultSummary) this.hud.resultSummary.textContent = summary;
    this.hideLootReveal();
    if (this.hud.resultPrimary) this.hud.resultPrimary.textContent = primary;
    if (this.hud.resultPrimary) this.hud.resultPrimary.disabled = this.resultState.saving;
  }

  hideLootReveal() {
    if (this.hud.lootReveal) {
      this.hud.lootReveal.hidden = true;
      this.hud.lootReveal.removeAttribute("data-rarity");
    }

    if (this.hud.lootCard) {
      this.hud.lootCard.style.removeProperty("--loot-color");
    }

    if (this.hud.lootStats) {
      this.hud.lootStats.replaceChildren();
    }
  }

  showLootReveal(drop, alreadyGranted) {
    if (!drop || !this.hud.lootReveal) {
      return;
    }

    this.resultState.drop = drop;
    const rarityColor = drop.rarityColor || "#f7f8fb";
    const rarityText = `${drop.rarityColorName || ""} ${drop.rarityLabel || drop.rarity || "Gear"}`.trim();
    const weaponType = this.formatWeaponType(drop.weaponType);

    this.hud.lootReveal.hidden = false;
    this.hud.lootReveal.dataset.rarity = drop.rarity || "common";

    if (this.hud.lootCard) {
      this.hud.lootCard.style.setProperty("--loot-color", rarityColor);
      this.hud.lootCard.dataset.rarity = drop.rarity || "common";
    }

    if (this.hud.lootRarity) {
      this.hud.lootRarity.textContent = alreadyGranted
        ? `Already claimed - ${rarityText}`
        : rarityText;
    }

    if (this.hud.lootName) {
      this.hud.lootName.textContent = drop.name || "Gear";
    }

    if (this.hud.lootType) {
      this.hud.lootType.textContent = `${weaponType} weapon`;
    }

    if (this.hud.lootStats) {
      this.hud.lootStats.replaceChildren(...this.createStatNodes(drop.stats || {}));
    }
    this.sound.play("loot");
  }

  createStatNodes(stats) {
    const entries = Object.entries(stats).filter(([, value]) => Number.isFinite(Number(value)));

    return entries.flatMap(([key, value]) => {
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = this.formatStatName(key);
      detail.textContent = this.formatStatValue(key, value);
      return [term, detail];
    });
  }

  formatWeaponType(weaponType) {
    if (!weaponType) {
      return "Gear";
    }

    return String(weaponType)
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  formatStatName(statName) {
    return String(statName)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  formatStatValue(statName, value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return String(value);
    }

    if (statName === "fireRate") {
      return `${number.toFixed(2).replace(/\.?0+$/, "")}/s`;
    }

    if (statName === "chargeTime" || statName === "beamDuration") {
      return `${number.toFixed(2).replace(/\.?0+$/, "")}s`;
    }

    return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/\.?0+$/, "");
  }

  async saveProgress(clearedLevel) {
    try {
      const response = await fetch("/api/player/progress", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ clearedLevel }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.authenticated || !payload.player) {
        throw new Error(payload.message || "Progress save failed");
      }

      this.setPlayerProgress(payload.player);
      this.resultState.saving = false;
      this.resultState.saved = true;
      if (this.hud.resultPrimary) {
        this.hud.resultPrimary.disabled = false;
      }
      this.hud.onProgressSaved?.(payload.player);

      const nextLevel = this.getNextPlayableLevelNumber();
      const grantText = payload.alreadyGranted
        ? " Reward already claimed."
        : payload.drop
          ? " Loot box opened."
          : "";
      const summary =
        clearedLevel >= MAX_LEVEL_NUMBER
          ? `Highest cleared level: ${payload.player.highestClearedLevel}.${grantText}`
          : `Highest cleared level: ${payload.player.highestClearedLevel}. Next: Level ${nextLevel}.${grantText}`;
      if (this.hud.resultSummary) {
        this.hud.resultSummary.textContent = summary;
      }
      this.showLootReveal(payload.drop, Boolean(payload.alreadyGranted));
    } catch (err) {
      console.error("Player progress save failed", {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
      this.highestClearedLevel = Math.max(this.highestClearedLevel, clearedLevel);
      this.resultState.saving = false;
      if (this.hud.resultPrimary) {
        this.hud.resultPrimary.disabled = false;
      }
      if (this.hud.resultSummary) {
        this.hud.resultSummary.textContent =
          "Progress could not be saved. Next level is unlocked for this session.";
      }
    }
  }

  updateLevelStatus() {
    if (!this.hud.levelStatus && !this.hud.waveStatus) {
      return;
    }

    const status = this.level.status;
    if (this.hud.levelStatus) {
      this.hud.levelStatus.textContent = status.levelLabel;
    }

    if (this.hud.levelProgress) {
      const progress =
        status.enemiesTotal > 0 ? Math.min(1, status.enemiesSpawned / status.enemiesTotal) : 0;
      this.hud.levelProgress.style.setProperty("--level-ratio", String(progress));
    }

    if (this.hud.waveStatus) {
      const count = `${status.enemiesSpawned}/${status.enemiesTotal}`;
      this.hud.waveStatus.textContent = `${status.waveLabel} ${status.waveNumber}/${status.totalWaves} ${count}`;
    }
  }

  drawBackground(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#070a12");
    gradient.addColorStop(0.52, "#111827");
    gradient.addColorStop(1, "#12151d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(114, 216, 255, 0.09)";
    ctx.lineWidth = 1;
    const gridSize = 56;

    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  drawStars(ctx) {
    for (const star of this.starLayers) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(247, 248, 251, ${star.alpha})`;
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPointerReticle(ctx) {
    const pointer = this.input.getFlightInput().pointer;
    if (!pointer) {
      return;
    }

    const radius = 10 * this.viewport.size.pixelRatio;
    ctx.save();
    ctx.strokeStyle = "rgba(114, 216, 255, 0.48)";
    ctx.lineWidth = 1.5 * this.viewport.size.pixelRatio;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pointer.x - radius * 1.6, pointer.y);
    ctx.lineTo(pointer.x - radius * 0.65, pointer.y);
    ctx.moveTo(pointer.x + radius * 0.65, pointer.y);
    ctx.lineTo(pointer.x + radius * 1.6, pointer.y);
    ctx.moveTo(pointer.x, pointer.y - radius * 1.6);
    ctx.lineTo(pointer.x, pointer.y - radius * 0.65);
    ctx.moveTo(pointer.x, pointer.y + radius * 0.65);
    ctx.lineTo(pointer.x, pointer.y + radius * 1.6);
    ctx.stroke();
    ctx.restore();
  }
}
