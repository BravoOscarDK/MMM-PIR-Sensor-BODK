"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture(frontend) {
  let now = 10000;
  let definition;
  const notifications = [], commands = [];
  const context = {
    Date: { now: () => now }, console: { info() {}, error() {} },
    setTimeout: fn => fn, clearTimeout() {}, clearInterval() {},
    window: { addEventListener() {}, removeEventListener() {} },
    Module: { register(name, value) { definition = value; } },
    module: { exports: {} }, __dirname: path.join(__dirname, ".."),
    require(name) {
      if (name === "node_helper") return { create: value => value };
      if (name === "node:child_process") return {
        execFile(command, args, options, callback) {
          commands.push({ command, args, callback });
          return { kill() {} };
        }
      };
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", frontend ? "MMM-PIR-Sensor-BODK.js" : "node_helper.js"), "utf8"), context);
  const instance = frontend ? definition : context.module.exports;
  instance.config = frontend ? { ...instance.defaults } : undefined;
  instance.sendSocketNotification = (name, payload) => notifications.push({ name, payload });
  instance.start();
  return { instance, notifications, commands, advance(ms) { now += ms; } };
}

function mouse(instance, x, isTrusted = true) {
  instance.mouseMoveHandler({ screenX: x, screenY: 10, isTrusted });
}

test("output repositioning cannot immediately wake standby", () => {
  const f = fixture(true);
  f.advance(2000);
  mouse(f.instance, 100);
  f.instance.socketNotificationReceived("POWER_CHANGING", true);
  mouse(f.instance, 0);
  mouse(f.instance, 50);
  f.instance.socketNotificationReceived("POWER_CHANGING", false);
  mouse(f.instance, 0);
  f.advance(500);
  mouse(f.instance, 20);
  f.advance(1000);
  mouse(f.instance, 20);
  assert.equal(f.notifications.filter(n => n.name === "MOUSE_PRESENCE").length, 0);
  mouse(f.instance, 21);
  assert.equal(f.notifications.filter(n => n.name === "MOUSE_PRESENCE").length, 1);
});

test("scripted events are ignored and real movement is throttled", () => {
  const f = fixture(true);
  f.advance(2000);
  mouse(f.instance, 100);
  mouse(f.instance, 101, false);
  mouse(f.instance, 102);
  mouse(f.instance, 103);
  f.advance(500);
  mouse(f.instance, 104);
  assert.equal(f.notifications.filter(n => n.name === "MOUSE_PRESENCE").length, 2);
  f.instance.config.wakeOnMouse = false;
  f.advance(500);
  mouse(f.instance, 105);
  assert.equal(f.notifications.filter(n => n.name === "MOUSE_PRESENCE").length, 2);
});

function backend() {
  const f = fixture(false);
  Object.assign(f.instance, {
    config: { commandType: "xset", verifyPower: false, wakeOnMouse: true, deactivateDelay: 30000 },
    started: true, activated: true
  });
  f.instance.resetTimeout("sensor ready");
  f.instance.setPower(false);
  return f;
}

test("queued mouse events cannot reverse standby or reset its deadline", () => {
  const f = backend();
  const deadline = f.instance.deadline;
  f.advance(100);
  f.instance.socketNotificationReceived("MOUSE_PRESENCE");
  assert.equal(f.instance.desiredPower, false);
  assert.equal(f.instance.deadline, deadline);
  f.commands[0].callback(null);
  f.advance(500);
  f.instance.socketNotificationReceived("MOUSE_PRESENCE");
  assert.equal(f.instance.desiredPower, false);
  assert.equal(f.instance.deadline, deadline);
  assert.equal(f.commands.length, 1);
  f.advance(501);
  f.instance.socketNotificationReceived("MOUSE_PRESENCE");
  assert.equal(f.instance.desiredPower, true);
  assert.ok(f.instance.deadline > deadline);
  assert.equal(f.commands.length, 2);
});

test("PIR can queue a wake while the standby command is pending", () => {
  const f = backend();
  // Same sequence used by the PIR line handler.
  f.instance.resetTimeout("PIR");
  f.instance.setPower(true);
  assert.equal(f.commands.length, 1);
  f.commands[0].callback(null);
  assert.equal(f.commands.length, 2);
  assert.equal(f.commands[1].args.at(-1), "on");
});

test("a failed display command also releases the mouse suppression", () => {
  const f = backend();
  f.commands[0].callback(new Error("display unavailable"));
  assert.equal(f.instance.commandRunning, false);
  assert.equal(f.notifications.filter(n => n.name === "POWER_CHANGING").at(-1).payload, false);
  f.advance(1001);
  f.instance.socketNotificationReceived("MOUSE_PRESENCE");
  assert.equal(f.instance.desiredPower, true);
  assert.equal(f.commands.length, 2);
});
