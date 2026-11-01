"use strict";
// Based on MMM-PIR-Sensor-Lite by Grena. MIT licensed.
const NodeHelper = require("node_helper");
const { spawn, execFile } = require("node:child_process");
const readline = require("node:readline");
const path = require("node:path");
module.exports = NodeHelper.create({
  start() {
    this.started = false;
    this.errors = {};
    this.stopped = false;
    this.activated = null;
    this.desiredPower = true;
    this.commandRunning = false;
  },
  status(kind, error) {
    if (error) this.errors[kind] = error;
    else delete this.errors[kind];
    this.sendSocketNotification("STATUS", { sensorReady: this.started, error: Object.values(this.errors).join(" ") });
  },
  report(message) {
    console.error(`${this.name}: ${message}`);
    this.sendSocketNotification("DEBUG", message);
  },
  socketNotificationReceived(notification, payload) {
    if (notification !== "CONFIG" || this.stopped) return;
    if (this.config) {
      if (this.started) this.sendSocketNotification("STARTED", true);
      this.sendSocketNotification("DEADLINE", this.deadline);
      this.status();
      return;
    }
    const c = Object.assign({ commandType: "xrandr", hdmiPort: "HDMI-1", rotation: "normal", deactivateDelay: 900000, debugMode: false, verifyPower: true }, payload);
    if (!Number.isInteger(c.sensorPin) || c.sensorPin < 1 || c.sensorPin > 27 ||
        !Number.isInteger(c.deactivateDelay) || c.deactivateDelay < 1000 || c.deactivateDelay > 86400000 ||
        !["xrandr", "xset", "vcgencmd"].includes(c.commandType) ||
        !["normal", "left", "right", "inverted"].includes(c.rotation) ||
        typeof c.hdmiPort !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(c.hdmiPort) || typeof c.debugMode !== "boolean" || typeof c.verifyPower !== "boolean") {
      this.status("config", "Invalid configuration: check sensorPin, deactivateDelay, commandType, hdmiPort, rotation and boolean options.");
      return;
    }
    this.config = c;
    this.status("config");
    this.setPower(true);
    this.getDataPIR();
  },
  getDataPIR() {
    if (this.stopped) return;
    const child = spawn("python3", ["-u", path.join(__dirname, "pir.py"), String(this.config.sensorPin)]);
    this.sensor = child;
    this.sensorWatchdog = setTimeout(() => {
      this.status("sensor", "PIR did not become ready; restarting sensor.");
      child.kill();
    }, 15000);
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      if (this.stopped || this.sensor !== child) return;
      if (line.trim() === "PIR_START") {
        clearTimeout(this.sensorWatchdog);
        this.started = true;
        this.status("sensor");
        this.resetTimeout();
        this.sendSocketNotification("STARTED", true);
      } else if (line.trim() === "USER_PRESENCE" && this.started) {
        this.resetTimeout();
        this.sendSocketNotification("USER_PRESENCE", true);
        this.setPower(true);
      }
    });
    child.stderr.on("data", (data) => this.report(`PIR: ${String(data).trim()}`));
    child.on("error", (error) => this.report(`Cannot start PIR: ${error.message}`));
    child.on("close", (code, signal) => {
      lines.close();
      if (this.sensor !== child) return;
      this.sensor = null;
      clearTimeout(this.sensorWatchdog);
      this.started = false;
      if (!this.stopped) {
        this.report(`PIR exited (${signal || code}); restarting in 5 seconds.`);
        this.status("sensor", "PIR unavailable; screen kept on while sensor restarts.");
        clearTimeout(this.timeout);
        this.deadline = null;
        this.setPower(true);
        this.sensorRetry = setTimeout(() => this.getDataPIR(), 5000);
      }
    });
  },
  resetTimeout() {
    clearTimeout(this.timeout);
    this.deadline = Date.now() + this.config.deactivateDelay;
    this.sendSocketNotification("DEADLINE", this.deadline);
    this.timeout = setTimeout(() => this.setPower(false), this.config.deactivateDelay);
  },
  setPower(on) {
    this.desiredPower = on;
    clearTimeout(this.powerRetry);
    this.applyPower();
  },
  applyPower() {
    if (this.stopped || this.commandRunning || this.activated === this.desiredPower) return;
    const on = this.desiredPower;
    let command, args;
    switch (this.config.commandType) {
      case "vcgencmd": command = "/usr/bin/vcgencmd"; args = ["display_power", on ? "1" : "0"]; break;
      case "xset": command = "xset"; args = ["dpms", "force", on ? "on" : "off"]; break;
      default: command = "xrandr"; args = ["--output", this.config.hdmiPort, ...(on ? ["--rotate", this.config.rotation, "--auto"] : ["--off"])];
    }
    this.commandRunning = true;
    const done = (error) => {
      this.commandRunning = false;
      this.powerProcess = null;
      if (this.stopped) return;
      if (error) {
        this.activated = null;
        this.report(`Monitor ${on ? "on" : "off"} failed: ${error.message}; retrying in 5 seconds.`);
        this.status("power", `Monitor ${on ? "on" : "off"} failed: ${error.message}`);
        this.powerRetry = setTimeout(() => this.applyPower(), 5000);
      } else {
        this.activated = on;
        this.status("power");
        this.sendSocketNotification(on ? "POWER_ON" : "POWER_OFF", true);
        this.applyPower();
      }
    };
    if (this.config.debugMode) done(null);
    else this.powerProcess = execFile(command, args, { timeout: 10000 }, (error) => {
      if (this.stopped) return;
      if (error || !this.config.verifyPower) done(error);
      else this.verifyTimer = setTimeout(() => this.verifyMonitor(on, done), 300);
    });
  },
  verifyMonitor(on, done) {
    if (this.stopped) return;
    const type = this.config.commandType;
    const command = type === "vcgencmd" ? "/usr/bin/vcgencmd" : type;
    const args = type === "xrandr" ? ["--query"] : type === "xset" ? ["q"] : ["display_power"];
    this.powerProcess = execFile(command, args, { timeout: 10000 }, (error, stdout) => {
      if (this.stopped) return;
      if (error) return done(error);
      let actual = null;
      const text = String(stdout);
      if (type === "vcgencmd") {
        const match = text.match(/display_power=(0|1)/);
        if (match) actual = match[1] === "1";
      } else if (type === "xset") {
        const match = text.match(/Monitor is (On|Off|Standby|Suspend)/i);
        if (match) actual = match[1].toLowerCase() === "on";
      } else {
        const output = text.split(/\r?\n/).find(line => line.split(/\s+/)[0] === this.config.hdmiPort);
        if (output && / connected(?: |$)/.test(output)) actual = /\b\d+x\d+\+[-]?\d+\+[-]?\d+\b/.test(output);
        else if (output && / disconnected(?: |$)/.test(output)) actual = false;
      }
      done(actual === on ? null : new Error(actual === null ? "Cannot determine display output state" : "Display output did not reach requested state"));
    });
  },
  stop() {
    this.stopped = true;
    clearTimeout(this.timeout);
    clearTimeout(this.powerRetry);
    clearTimeout(this.sensorRetry);
    clearTimeout(this.sensorWatchdog);
    clearTimeout(this.verifyTimer);
    if (this.sensor) this.sensor.kill();
    if (this.powerProcess) this.powerProcess.kill();
  }
});
