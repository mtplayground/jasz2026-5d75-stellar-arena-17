import { GameLoop } from "./GameLoop.js";
import { InputController } from "./InputController.js";
import { Renderer } from "./Renderer.js";
import { Viewport } from "./Viewport.js";

export function createGameShell({
  canvas,
  screenSize,
  loopState,
  pauseToggle,
  pauseBanner,
  weaponStatus,
  weaponDetail,
  levelStatus,
  levelProgress,
  waveStatus,
  healthStatus,
  healthMeter,
  livesStatus,
  combatStatus,
  resultScreen,
  resultLabel,
  resultTitle,
  resultSummary,
  lootReveal,
  lootCard,
  lootRarity,
  lootName,
  lootType,
  lootStats,
  resultPrimary,
  resultMenu,
  onProgressSaved,
}) {
  if (!canvas || !screenSize || !loopState || !pauseToggle || !pauseBanner) {
    throw new Error("Game shell could not find all required DOM elements");
  }

  let pausedByUser = false;
  let pausedByVisibility = false;

  const setPausePresentation = (paused) => {
    loopState.textContent = paused ? "Paused" : "Running";
    pauseToggle.setAttribute("aria-pressed", String(paused));
    pauseToggle.setAttribute("aria-label", paused ? "Resume game loop" : "Pause game loop");
    pauseToggle.querySelector("span").textContent = paused ? ">" : "II";
    pauseBanner.hidden = !paused;
  };

  const input = new InputController({
    canvas,
    onPauseToggle: () => {
      pausedByUser = !pausedByUser;
      applyPauseState();
    },
  });
  const viewport = new Viewport(canvas, (size) => {
    screenSize.textContent = `${Math.round(size.width / size.pixelRatio)} x ${Math.round(
      size.height / size.pixelRatio,
    )}`;
  });
  const renderer = new Renderer(canvas, viewport, input, {
    weaponStatus,
    weaponDetail,
    levelStatus,
    levelProgress,
    waveStatus,
    healthStatus,
    healthMeter,
    livesStatus,
    combatStatus,
    resultScreen,
    resultLabel,
    resultTitle,
    resultSummary,
    lootReveal,
    lootCard,
    lootRarity,
    lootName,
    lootType,
    lootStats,
    resultPrimary,
    resultMenu,
    onProgressSaved,
  });
  const loop = new GameLoop({
    update: (dt) => renderer.update(dt),
    render: (alpha) => renderer.render(alpha),
  });

  const applyPauseState = () => {
    const paused = pausedByUser || pausedByVisibility;
    loop.setPaused(paused);
    setPausePresentation(paused);
  };

  pauseToggle.addEventListener("click", () => {
    pausedByUser = !pausedByUser;
    applyPauseState();
  });

  document.addEventListener("visibilitychange", () => {
    pausedByVisibility = document.hidden;
    applyPauseState();
  });

  window.addEventListener("blur", () => {
    pausedByVisibility = true;
    applyPauseState();
  });

  window.addEventListener("focus", () => {
    pausedByVisibility = document.hidden;
    applyPauseState();
  });

  return {
    start() {
      viewport.start();
      input.bind();
      setPausePresentation(false);
      loop.start();
    },
    stop() {
      input.destroy();
      viewport.stop();
      loop.stop();
      setPausePresentation(true);
    },
    setPlayerProgress(player) {
      renderer.setPlayerProgress(player);
    },
    setEquippedLoadout(equippedLoadout) {
      renderer.setEquippedLoadout(equippedLoadout);
    },
  };
}
