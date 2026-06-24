import { getNextLevelNumber } from "./game/data/levelDefinitions.js";

const ROUTES = new Set(["menu", "game", "collection"]);
const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

function readRoute() {
  const route = window.location.hash.replace(/^#\/?/, "");
  return ROUTES.has(route) ? route : "menu";
}

function playerDisplayName(player) {
  return player?.name || player?.email || "Player";
}

function formatWeaponType(weaponType) {
  if (!weaponType) {
    return "Gear";
  }

  return String(weaponType)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStatName(statName) {
  return String(statName)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStatValue(statName, value) {
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

function formatSource(source) {
  return String(source || "inventory")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (textContent !== undefined) {
    element.textContent = textContent;
  }

  return element;
}

function raritySortValue(gear) {
  const explicitRank = Number(gear.rarityRank);

  if (Number.isFinite(explicitRank)) {
    return explicitRank;
  }

  const index = RARITY_ORDER.indexOf(gear.rarity);
  return index === -1 ? 0 : RARITY_ORDER.length - index;
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
  collectionStatus,
  collectionGroups,
  collectionRefresh,
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
    collectionStatus,
    collectionGroups,
    collectionRefresh,
    gamePilot,
  ];

  if (required.some((element) => !element)) {
    throw new Error("App router could not find all required DOM elements");
  }

  let route = readRoute();
  let session = { status: "loading", player: null, loginUrl: null };
  let inventoryState = {
    status: "idle",
    ownerSub: null,
    ownedGear: [],
    error: null,
  };

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
    renderCollection();

    if (route === "collection" && signedIn) {
      loadInventory();
    }
  };

  const renderCollection = () => {
    const player = session.player;

    if (!player) {
      collectionStatus.textContent = "Sign in to view saved gear.";
      collectionGroups.hidden = true;
      collectionGroups.replaceChildren();
      collectionRefresh.disabled = true;
      return;
    }

    collectionRefresh.disabled = inventoryState.status === "loading";

    if (inventoryState.status === "loading") {
      collectionStatus.textContent = "Loading saved gear.";
      collectionGroups.hidden = true;
      collectionGroups.replaceChildren();
      return;
    }

    if (inventoryState.status === "error") {
      collectionStatus.textContent = inventoryState.error || "Inventory could not be loaded.";
      collectionGroups.hidden = true;
      collectionGroups.replaceChildren();
      return;
    }

    if (inventoryState.ownerSub !== player.sub) {
      collectionStatus.textContent = "Saved gear loads here.";
      collectionGroups.hidden = true;
      collectionGroups.replaceChildren();
      return;
    }

    if (inventoryState.ownedGear.length === 0) {
      collectionStatus.textContent = "No gear in inventory.";
      collectionGroups.hidden = true;
      collectionGroups.replaceChildren();
      return;
    }

    collectionStatus.textContent = `${inventoryState.ownedGear.length} owned gear item${
      inventoryState.ownedGear.length === 1 ? "" : "s"
    }.`;
    collectionGroups.hidden = false;
    collectionGroups.replaceChildren(...createInventoryGroups(inventoryState.ownedGear));
  };

  const createInventoryGroups = (ownedGear) => {
    const sorted = [...ownedGear].sort((left, right) => {
      const rarityDelta = raritySortValue(right) - raritySortValue(left);

      if (rarityDelta !== 0) {
        return rarityDelta;
      }

      const weaponDelta = formatWeaponType(left.weaponType).localeCompare(
        formatWeaponType(right.weaponType),
      );

      if (weaponDelta !== 0) {
        return weaponDelta;
      }

      return String(left.name || "").localeCompare(String(right.name || ""));
    });
    const groups = new Map();

    for (const gear of sorted) {
      const rarity = gear.rarity || "common";
      if (!groups.has(rarity)) {
        groups.set(rarity, []);
      }
      groups.get(rarity).push(gear);
    }

    return [...groups.values()].map((items) => createRarityGroup(items));
  };

  const createRarityGroup = (items) => {
    const first = items[0];
    const section = createElement("section", "inventory-rarity-group");
    section.dataset.rarity = first.rarity || "common";

    const header = createElement("header", "inventory-rarity-header");
    const title = createElement(
      "h2",
      null,
      `${first.rarityColorName || ""} ${first.rarityLabel || first.rarity || "Gear"}`.trim(),
    );
    const count = createElement("span", "inventory-count", String(items.length));
    header.append(title, count);

    const list = createElement("div", "inventory-grid");
    list.append(...items.map((gear) => createGearCard(gear)));
    section.append(header, list);
    return section;
  };

  const createGearCard = (gear) => {
    const card = createElement("article", "inventory-card");
    const rarityColor = gear.rarityColor || "#f7f8fb";
    card.style.setProperty("--gear-color", rarityColor);
    card.dataset.rarity = gear.rarity || "common";

    const heading = createElement("div", "inventory-card-heading");
    const name = createElement("h3", null, gear.name || "Gear");
    const weaponType = createElement("span", "inventory-weapon-type", formatWeaponType(gear.weaponType));
    heading.append(name, weaponType);

    const meta = createElement("p", "inventory-meta");
    meta.textContent = `Item level ${gear.itemLevel || 1} - ${formatSource(gear.source)}`;

    const stats = createElement("dl", "inventory-stats");
    const statEntries = Object.entries(gear.stats || {}).filter(([, value]) =>
      Number.isFinite(Number(value)),
    );
    stats.append(
      ...statEntries.flatMap(([key, value]) => {
        const term = createElement("dt", null, formatStatName(key));
        const detail = createElement("dd", null, formatStatValue(key, value));
        return [term, detail];
      }),
    );

    card.append(heading, meta, stats);
    return card;
  };

  const loadInventory = async ({ force = false } = {}) => {
    const player = session.player;

    if (!player || inventoryState.status === "loading") {
      return;
    }

    if (!force && inventoryState.ownerSub === player.sub && inventoryState.status === "ready") {
      return;
    }

    inventoryState = {
      status: "loading",
      ownerSub: player.sub,
      ownedGear: [],
      error: null,
    };
    renderCollection();

    try {
      const response = await fetch("/api/gear", {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload = await response.json();

      if (!response.ok || !payload.authenticated || !Array.isArray(payload.ownedGear)) {
        throw new Error(payload.message || "Inventory fetch failed");
      }

      inventoryState = {
        status: "ready",
        ownerSub: player.sub,
        ownedGear: payload.ownedGear,
        error: null,
      };
    } catch (err) {
      console.error("Inventory fetch failed", {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
      inventoryState = {
        status: "error",
        ownerSub: player.sub,
        ownedGear: [],
        error: "Inventory is temporarily unavailable.",
      };
    }

    renderCollection();
  };

  playButton.addEventListener("click", () => navigate("game"));
  collectionButton.addEventListener("click", () => navigate("collection"));
  collectionRefresh.addEventListener("click", () => loadInventory({ force: true }));

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
      if (inventoryState.ownerSub && inventoryState.ownerSub !== session.player?.sub) {
        inventoryState = {
          status: "idle",
          ownerSub: null,
          ownedGear: [],
          error: null,
        };
      }
      render();
    },
    updatePlayer(player) {
      if (session.player) {
        session = { ...session, player };
        inventoryState = {
          status: "idle",
          ownerSub: null,
          ownedGear: [],
          error: null,
        };
        render();
      }
    },
    navigate,
  };
}
