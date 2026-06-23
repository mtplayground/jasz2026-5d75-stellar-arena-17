export class InputController {
  constructor({ onPauseToggle }) {
    this.onPauseToggle = onPauseToggle;
    this.abortController = new AbortController();
  }

  bind() {
    const { signal } = this.abortController;

    window.addEventListener(
      "keydown",
      (event) => {
        if (event.code === "Escape" || event.code === "KeyP") {
          event.preventDefault();
          this.onPauseToggle();
        }
      },
      { signal },
    );
  }

  destroy() {
    this.abortController.abort();
  }
}
