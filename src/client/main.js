import { createGameShell } from "./game/createGameShell.js";

const shell = createGameShell({
  canvas: document.querySelector("#game-canvas"),
  screenSize: document.querySelector("#screen-size"),
  loopState: document.querySelector("#loop-state"),
  pauseToggle: document.querySelector("#pause-toggle"),
  pauseBanner: document.querySelector("#pause-banner"),
});

shell.start();
