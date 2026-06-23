export class InputController {
  constructor({ canvas, onPauseToggle }) {
    this.canvas = canvas;
    this.onPauseToggle = onPauseToggle;
    this.abortController = new AbortController();
    this.keys = new Set();
    this.pointer = {
      active: false,
      x: 0,
      y: 0,
    };
  }

  bind() {
    const { signal } = this.abortController;

    window.addEventListener(
      "keydown",
      (event) => {
        if (event.code === "Escape" || event.code === "KeyP") {
          event.preventDefault();
          this.onPauseToggle();
          return;
        }

        if (this.isMovementKey(event.code)) {
          this.keys.add(event.code);
          event.preventDefault();
        }
      },
      { signal },
    );

    window.addEventListener(
      "keyup",
      (event) => {
        if (this.isMovementKey(event.code)) {
          this.keys.delete(event.code);
          event.preventDefault();
        }
      },
      { signal },
    );

    this.canvas.addEventListener("pointermove", (event) => this.updatePointer(event), { signal });
    this.canvas.addEventListener("pointerdown", (event) => this.updatePointer(event), { signal });
    this.canvas.addEventListener(
      "pointerleave",
      () => {
        this.pointer.active = false;
      },
      { signal },
    );
  }

  destroy() {
    this.abortController.abort();
    this.keys.clear();
    this.pointer.active = false;
  }

  isMovementKey(code) {
    return [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
    ].includes(code);
  }

  updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / Math.max(1, rect.width);
    const scaleY = this.canvas.height / Math.max(1, rect.height);

    this.pointer.active = true;
    this.pointer.x = (event.clientX - rect.left) * scaleX;
    this.pointer.y = (event.clientY - rect.top) * scaleY;
  }

  isFlightEnabled() {
    return this.canvas.closest(".app-shell")?.dataset.route === "game";
  }

  getFlightInput() {
    if (!this.isFlightEnabled()) {
      return {
        moveX: 0,
        moveY: 0,
        pointer: null,
      };
    }

    const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA");
    const right = this.keys.has("ArrowRight") || this.keys.has("KeyD");
    const up = this.keys.has("ArrowUp") || this.keys.has("KeyW");
    const down = this.keys.has("ArrowDown") || this.keys.has("KeyS");
    const moveX = (right ? 1 : 0) - (left ? 1 : 0);
    const moveY = (down ? 1 : 0) - (up ? 1 : 0);

    return {
      moveX,
      moveY,
      pointer: this.pointer.active ? { x: this.pointer.x, y: this.pointer.y } : null,
    };
  }
}
