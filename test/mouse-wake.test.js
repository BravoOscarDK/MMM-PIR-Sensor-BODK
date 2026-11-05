"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function helper() {
  const commands = [];
  const notifications = [];
  const context = {
    module: { exports: {} }, console, __dirname: path.join(__dirname, ".."),
    setTimeout: () => 1, clearTimeout() {},
    require(name) {
      if (name === "node_helper") return { create: value => value };
      if (name === "node:child_process") return {
        execFile(command, args, options, callback) { commands.push({ command, args, callback }); }
      };
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../node_helper.js"), "utf8"), context);
  const h = context.module.exports;
  h.sendSocketNotification = (name, value) => notifications.push({ name, value });
  h.start();
  h.getDataPIR = () => {};
  h.socketNotificationReceived("CONFIG", { sensorPin: 2, verifyPower: false });
  commands.shift().callback(null);
  h.started = true;
  notifications.length = 0;
  return { h, commands, notifications };
}

test("mouse wakes a sleeping display and resets its deadline", () => {
  const { h, commands, notifications } = helper();
  h.activated = false;
  h.socketNotificationReceived("MOUSE_PRESENCE");
  assert.equal(h.desiredPower, true);
  assert.equal(commands.length, 1);
  assert.ok(commands[0].args.includes("--auto"));
  assert.ok(h.deadline >= Date.now() + h.config.deactivateDelay - 100);
  assert.ok(notifications.some(n => n.name === "DEADLINE"));
});

test("movement while switch-off is pending queues switch-on", () => {
  const { h, commands } = helper();
  h.setPower(false);
  h.socketNotificationReceived("MOUSE_PRESENCE");
  assert.equal(commands.length, 1);
  commands[0].callback(null);
  assert.equal(commands.length, 2);
  assert.ok(commands[1].args.includes("--auto"));
});

test("disabled mouse wake and stopped helper ignore mouse activity", () => {
  const { h, commands, notifications } = helper();
  h.config.wakeOnMouse = false;
  h.socketNotificationReceived("MOUSE_PRESENCE");
  h.config.wakeOnMouse = true;
  h.stopped = true;
  h.socketNotificationReceived("MOUSE_PRESENCE");
  assert.equal(commands.length, 0);
  assert.equal(notifications.length, 0);
});

test("mouse wake preserves sensor-outage fail-safe", () => {
  const { h, notifications } = helper();
  h.started = false;
  h.deadline = null;
  h.socketNotificationReceived("MOUSE_PRESENCE");
  assert.equal(h.deadline, null);
  assert.equal(h.desiredPower, true);
  assert.ok(!notifications.some(n => n.name === "DEADLINE"));
});

test("frontend throttles movement, works while hidden, and respects opt-out", () => {
  let frontend;
  let now = 1000;
  const handlers = new Set();
  const messages = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../MMM-PIR-Sensor-BODK.js"), "utf8"), {
    Module: { register(name, value) { frontend = value; } },
    window: {
      addEventListener(name, handler) { handlers.add(handler); },
      removeEventListener(name, handler) { handlers.delete(handler); }
    },
    Date: { now: () => now }
  });
  frontend.config = { ...frontend.defaults };
  frontend.sendSocketNotification = name => messages.push(name);
  frontend.start();
  frontend.start();
  assert.equal(handlers.size, 1);
  frontend.suspended = true;
  const move = [...handlers][0];
  move();
  now += 100;
  move();
  now += 400;
  move();
  frontend.config.wakeOnMouse = false;
  now += 500;
  move();
  assert.equal(messages.filter(n => n === "MOUSE_PRESENCE").length, 2);
});
