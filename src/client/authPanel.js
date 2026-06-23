export function initAuthPanel({ panel, status, details, action, avatar, onSessionChange = () => {} }) {
  if (!panel || !status || !details || !action || !avatar) {
    throw new Error("Auth panel could not find all required DOM elements");
  }

  const setLoading = () => {
    panel.dataset.state = "loading";
    status.textContent = "Checking account";
    details.textContent = "Session status is loading.";
    action.textContent = "Sign in";
    action.disabled = true;
    avatar.hidden = true;
    avatar.removeAttribute("src");
    onSessionChange({ status: "loading", player: null, loginUrl: null });
  };

  const setLoggedOut = (loginUrl) => {
    panel.dataset.state = "signed-out";
    status.textContent = "Signed out";
    details.textContent = "Sign in to create or load your player account.";
    action.textContent = "Sign in";
    action.disabled = false;
    action.onclick = () => {
      window.location.assign(loginUrl || "/auth/login");
    };
    avatar.hidden = true;
    avatar.removeAttribute("src");
    onSessionChange({ status: "signed-out", player: null, loginUrl });
  };

  const setLoggedIn = ({ player, message, isNew }) => {
    panel.dataset.state = "signed-in";
    const displayName = player.name || player.email;
    const highestClear = player.highestClearedLevel || 0;
    status.textContent = displayName;
    details.textContent = message
      ? `${message} Highest clear: Level ${highestClear}.`
      : `Highest clear: Level ${highestClear}.`;
    action.textContent = "Refresh";
    action.disabled = false;
    action.onclick = () => refresh();

    if (player.pictureUrl) {
      avatar.src = player.pictureUrl;
      avatar.alt = `${displayName} profile image`;
      avatar.hidden = false;
    } else {
      avatar.hidden = true;
      avatar.removeAttribute("src");
    }

    onSessionChange({ status: "signed-in", player, message, isNew });
  };

  const setError = () => {
    panel.dataset.state = "error";
    status.textContent = "Account unavailable";
    details.textContent = "Player account status could not be loaded.";
    action.textContent = "Retry";
    action.disabled = false;
    action.onclick = () => refresh();
    avatar.hidden = true;
    avatar.removeAttribute("src");
    onSessionChange({ status: "error", player: null, loginUrl: null });
  };

  const refresh = async () => {
    setLoading();

    try {
      const response = await fetch("/api/player", {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload = await response.json();

      if (response.status === 401 || !payload.authenticated) {
        setLoggedOut(payload.loginUrl);
        return;
      }

      if (!response.ok) {
        setError();
        return;
      }

      setLoggedIn(payload);
    } catch (err) {
      console.error("Player account fetch failed", {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
      setError();
    }
  };

  refresh();

  return { refresh };
}
