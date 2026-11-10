/* Based on MMM-PIR-Sensor-Lite by Grena. MIT licensed. */
Module.register("MMM-PIR-Sensor-BODK", {
  text(key) {
    const texts = {
      "en": {
        "Automatic Standby": "Automatic Standby",
        "Loading...": "Loading..."
      },
      "da": {
        "Automatic Standby": "Automatisk standby",
        "Loading...": "Indlæser..."
      }
    };
    const language = String(this.config.language || "en").toLowerCase().split(/[-_]/)[0];
    return (Object.hasOwn(texts, language) ? texts[language] : texts.en)[key] || texts.en[key] || key;
  },
  defaults: {
    language: "en",
    sensorPin: 0, commandType: "xrandr", hdmiPort: "HDMI-1", rotation: "normal",
    title: null, deactivateDelay: 15 * 60 * 1000,
    updateInterval: 1000, animationSpeed: 1000, showCountDown: true, showDetection: true,
    hoursLabel: "h", minutesLabel: "m", secondsLabel: "s", debugMode: false,
    verifyPower: true, wakeOnMouse: true
  },
  getStyles() { return ["font-awesome.css"]; },
  start() {
    this.loaded = false;
    this.detected = false;
    this.errorMessage = "";
    this.suspended = false;
    if (this.mouseMoveHandler) window.removeEventListener("mousemove", this.mouseMoveHandler);
    this.lastMousePresence = null;
    this.lastMousePosition = null;
    this.powerChanging = false;
    this.mouseIgnoreUntil = Date.now() + 1000;
    this.mouseMoveHandler = (event) => {
      if (!this.config.wakeOnMouse) return;
      if (!event.isTrusted || !Number.isFinite(event.screenX) || !Number.isFinite(event.screenY)) return;
      const previous = this.lastMousePosition;
      this.lastMousePosition = { x: event.screenX, y: event.screenY };
      // Output changes can reposition the pointer without physical mouse input.
      // Track the new position even while suppressed, so it becomes the baseline.
      if (!previous || (previous.x === event.screenX && previous.y === event.screenY)) return;
      const now = Date.now();
      if (this.powerChanging || now < this.mouseIgnoreUntil) return;
      if (this.lastMousePresence !== null && now - this.lastMousePresence < 500) return;
      this.lastMousePresence = now;
      this.sendSocketNotification("MOUSE_PRESENCE");
    };
    window.addEventListener("mousemove", this.mouseMoveHandler, { passive: true });
    this.sendSocketNotification("CONFIG", this.config);
  },
  getDom() {
    const wrapper = document.createElement("div");
    if (this.errorMessage || !this.loaded) {
      wrapper.className = "dimmed light small";
      wrapper.textContent = this.errorMessage || this.text("Loading...");
      return wrapper;
    }
    if (this.config.showCountDown && this.config.title !== "") {
      const title = document.createElement("div");
      title.className = "light small";
      title.textContent = this.config.title ?? this.text("Automatic Standby");
      wrapper.appendChild(title);
    }
    const line = document.createElement("div");
    line.className = "medium";
    if (this.config.showDetection && this.detected) {
      const icon = document.createElement("span");
      icon.className = "fas fa-crosshairs bright";
      line.appendChild(icon);
    }
    if (this.config.showCountDown) {
      this.calculateCountdown();
      const values = [];
      if (this.diffHours > 0) values.push([this.diffHours, this.config.hoursLabel]);
      if (this.diffMinutes > 0) values.push([this.diffMinutes, this.config.minutesLabel]);
      values.push([this.diffSeconds, this.config.secondsLabel]);
      for (const [value, label] of values) {
        const number = document.createElement("span");
        number.className = "bright";
        number.textContent = ` ${value}`;
        const unit = document.createElement("span");
        unit.className = "dimmed small";
        unit.textContent = label;
        line.appendChild(number);
        line.appendChild(unit);
      }
    }
    wrapper.appendChild(line);
    return wrapper;
  },
  socketNotificationReceived(notification, payload) {
    if (notification === "POWER_CHANGING") {
      this.powerChanging = payload;
      this.mouseIgnoreUntil = Date.now() + 1000;
      this.lastMousePosition = null;
    } else if (notification === "DEADLINE") this.resetCountdown(payload);
    else if (notification === "STARTED") {
      this.loaded = true;
      this.redraw();
    } else if (notification === "STATUS") {
      this.errorMessage = payload.error || "";
      this.loaded = payload.sensorReady;
      this.redraw();
    } else if (notification === "USER_PRESENCE") this.setIconTimeout();
    else if (notification === "DEBUG") Log.error(`${this.name}: ${payload}`);
    else if (notification === "POWER_ON" || notification === "POWER_OFF") Log.info(`${this.name}: ${notification}`);
  },
  redraw() {
    if (!this.suspended) this.updateDom(0);
  },
  setIconTimeout() {
    if (!this.config.showDetection || this.suspended) return;
    this.detected = true;
    this.redraw();
    clearTimeout(this.iconTimeout);
    this.iconTimeout = setTimeout(() => {
      this.detected = false;
      this.redraw();
    }, Math.max(100, Number(this.config.animationSpeed) || 1000));
  },
  resetCountdown(deadline) {
    if (!Number.isFinite(deadline)) return;
    this.deadline = deadline;
    clearInterval(this.countdownInterval);
    this.calculateCountdown();
    if (!this.config.showCountDown || this.suspended) return;
    this.redraw();
    if (this.remainingTime <= 0) return;
    this.countdownInterval = setInterval(() => {
      this.calculateCountdown();
      this.redraw();
      if (this.remainingTime <= 0) clearInterval(this.countdownInterval);
    }, Math.min(5000, Math.max(100, Number(this.config.updateInterval) || 1000)));
  },
  calculateCountdown() {
    this.remainingTime = Math.max(0, (this.deadline || 0) - Date.now());
    const seconds = Math.ceil(this.remainingTime / 1000);
    this.diffHours = Math.floor(seconds / 3600);
    this.diffMinutes = Math.floor(seconds / 60) % 60;
    this.diffSeconds = seconds % 60;
  },
  suspend() {
    this.suspended = true;
    this.detected = false;
    clearInterval(this.countdownInterval);
    clearTimeout(this.iconTimeout);
  },
  resume() {
    this.suspended = false;
    this.resetCountdown(this.deadline);
    this.sendSocketNotification("CONFIG", this.config);
    this.redraw();
  }
});
