import { getNextLevelNumber } from "./game/data/levelDefinitions.js";

const ROUTES = new Set(["menu", "game", "collection"]);

function readRoute() {
  const route = window.location.hash.replace(/^#\/?/, "");
  return ROUTES.has(route) ? route : "menu";
}

function playerDisplayName(player) {
  return player?.name || player?.email || "Player";
}

export function initAppRouter({
  shell,
  menuScreen,
  gameScreen,
  collectionScreen,
  menuHeading,
  menuSubtitle,
  playButton,
  collectionButton,
  collectionOwner,
  backButtons,
  gamePilot,
}) {
  const required = [
    shell,
    menuScreen,
    gameScreen,
    collectionScreen,
    menuHeading,
    menuSubtitle,
    playButton,
    collectionButton,
    collectionOwner,
    gamePilot,
  ];

  if (required.some((element) => !element)) {
    throw new Error("App router could not find all required DOM elements");
  }

  let route = readRoute();
  let session = { status: "loading", player: null, loginUrl: null };

  const navigate = (nextRoute) => {
    route = ROUTES.has(nextRoute) ? nextRoute : "menu";
    if (!session.player && route !== "menu") {
      route = "menu";
    }
    window.location.hash = route;
    render();
  };

  const render = () => {
    const player = session.player;
    const signedIn = Boolean(player);
    const displayName = playerDisplayName(player);

    if (!signedIn && route !== "menu") {
      route = "menu";
    }

    shell.dataset.route = route;
    menuScreen.hidden = route !== "menu";
    gameScreen.hidden = route !== "game";
    collectionScreen.hidden = route !== "collection";

    playButton.disabled = !signedIn;
    collectionButton.disabled = !signedIn;

    if (session.status === "loading") {
      menuHeading.textContent = "Player Menu";
      menuSubtitle.textContent = "Checking account.";
    } else if (!signedIn) {
      menuHeading.textContent = "Player Menu";
      menuSubtitle.textContent = "Sign in to start a level.";
    } else {
      const nextLevel = getNextLevelNumber(player.highestClearedLevel || 0);
      menuHeading.textContent = `Ready, ${displayName}`;
      menuSubtitle.textContent = `Level ${nextLevel} is ready. Highest clear: ${player.highestClearedLevel || 0}.`;
      playButton.textContent = `Play Level ${nextLevel}`;
    }

    if (!signedIn) {
      playButton.textContent = "Play";
    }

    collectionOwner.textContent = signedIn ? `${displayName}'s Collection` : "Collection";
    gamePilot.textContent = signedIn ? displayName : "Player";
  };

  playButton.addEventListener("click", () => navigate("game"));
  collectionButton.addEventListener("click", () => navigate("collection"));

  for (const button of backButtons) {
    button.addEventListener("click", () => navigate(button.dataset.navRoute || "menu"));
  }

  window.addEventListener("hashchange", () => {
    route = readRoute();
    render();
  });

  render();

  return {
    updateSession(nextSession) {
      session = nextSession;
      render();
    },
    updatePlayer(player) {
      if (session.player) {
        session = { ...session, player };
        render();
      }
    },
    navigate,
  };
}
