"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
function fixture(config = {}) {
 const tasks = new Map(), commands = [], children = [], messages = [];
 let id = 0;
 const context = { module: { exports: {} }, __dirname, console: { error() {} }, Date,
  setTimeout(fn, delay) { tasks.set(++id, { fn, delay }); return id; },
  clearTimeout(key) { tasks.delete(key); },
  require(name) {
   if (name === 'node_helper') return { create: x => x };
   if (name === 'node:child_process') return {
    spawn() { const c = new EventEmitter(); c.stdout = new PassThrough(); c.stderr = new PassThrough(); c.kill = () => { c.killed = true; }; children.push(c); return c; },
    execFile(command, args, options, done) { const p = { kill() {} }; commands.push({ command, args, options, done }); return p; }
   };
   return require(name);
  }
 };
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, 'node_helper.js'), 'utf8'), context);
 const h = context.module.exports;
 h.sendSocketNotification = (n,p) => messages.push([n,p]);
 h.start(); h.socketNotificationReceived('CONFIG', Object.assign({ sensorPin: 2, deactivateDelay: 1000, verifyPower: false }, config));
 if (children.length) children[0].stdout.write('PIR_START\n');
 return { h, tasks, commands, children, messages, fire(key) { const t = tasks.get(key); assert.ok(t); tasks.delete(key); t.fn(); } };
}
test('failed off command retries without another motion', () => {
 const f = fixture(); f.commands[0].done(null); f.fire(f.h.timeout);
 f.commands[1].done(new Error('display busy'));
 assert.notEqual(f.h.activated, false);
 assert.equal(f.messages.filter(x => x[0] === 'POWER_OFF').length, 0);
 f.fire(f.h.powerRetry); f.commands[2].done(null);
 assert.equal(f.h.activated, false);
 assert.equal(f.messages.filter(x => x[0] === 'POWER_OFF').length, 1);
});
test('motion during off command queues on after off finishes', () => {
 const f = fixture(); f.commands[0].done(null); f.fire(f.h.timeout);
 f.children[0].stdout.write('PIR_START\nUSER_PRE');
 f.children[0].stdout.write('SENCE\nUSER_PRESENCE\n');
 assert.equal(f.messages.filter(x => x[0] === 'USER_PRESENCE').length, 2);
 assert.equal(f.commands.length, 2);
 f.commands[1].done(null);
 assert.equal(f.commands.length, 3);
 assert.ok(f.commands[2].args.includes('--auto'));
 f.commands[2].done(null); assert.equal(f.h.activated, true);
 f.fire(f.h.timeout); f.commands[3].done(null); assert.equal(f.h.activated, false);
});
test('repeated config cannot create duplicate sensor; shutdown clears timers', () => {
 const f = fixture(); f.h.socketNotificationReceived('CONFIG', { sensorPin: 2 });
 assert.equal(f.children.length, 1);
 f.h.stop(); assert.equal(f.tasks.size, 0); assert.equal(f.children[0].killed, true);
 f.commands[0].done(new Error('stopped')); assert.equal(f.tasks.size, 0);
});
test('sensor exit schedules restart and stop cancels restart', () => {
 const f = fixture(); f.children[0].emit('close', 1, null);
 f.fire(f.h.sensorRetry); assert.equal(f.children.length, 2);
 f.h.stop(); assert.equal(f.tasks.size, 0);
});
test('new motion replaces inactivity timeout', () => {
 const f = fixture(); const old = f.h.timeout;
 f.children[0].stdout.write('USER_PRESENCE\n');
 assert.equal(f.tasks.has(old), false); assert.ok(f.tasks.has(f.h.timeout));
});
test('twenty repeated inactivity and motion cycles keep switching', () => {
 const f = fixture(); f.commands[0].done(null);
 for (let i = 0; i < 20; i++) {
  f.fire(f.h.timeout); f.commands.at(-1).done(null); assert.equal(f.h.activated, false);
  f.children[0].stdout.write('USER_PRESENCE\n');
  f.commands.at(-1).done(null); assert.equal(f.h.activated, true);
 }
 assert.equal(f.messages.filter(x => x[0] === 'POWER_OFF').length, 20);
});
test('countdown follows server deadline and clamps expired time to zero', () => {
 let definition, tick, now = 1000, interval;
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, 'MMM-PIR-Sensor-BODK.js'), 'utf8'), {
  Module: { register(name, value) { definition = value; } },
  Date: { now: () => now }, Number, Math,
  setInterval(fn, delay) { tick = fn; interval = delay; return 1; }, clearInterval() {}
 });
 definition.config = { deactivateDelay: 30000, updateInterval: 0, showCountDown: true };
 definition.updateDom = () => {};
 definition.socketNotificationReceived('DEADLINE', 31000);
 assert.equal(definition.remainingTime, 30000); assert.equal(interval, 1000);
 now = 23500; tick(); assert.equal(definition.remainingTime, 7500);
 now = 40000; tick(); assert.equal(definition.remainingTime, 0);
});
for (const [type, onText, offText] of [
 ['xrandr', 'HDMI-1 connected primary 1920x1080+0+0 (normal)', 'HDMI-1 connected (normal)'],
 ['xset', 'Monitor is On', 'Monitor is Off'],
 ['vcgencmd', 'display_power=1', 'display_power=0']
]) {
 test(`${type}: verifies output and retries successful command with wrong state`, () => {
  const f = fixture({ verifyPower: true, commandType: type });
  f.commands[0].done(null); assert.equal(f.h.activated, null);
  f.fire(f.h.verifyTimer); f.commands[1].done(null, onText);
  assert.equal(f.h.activated, true);
  f.fire(f.h.timeout); f.commands[2].done(null);
  f.fire(f.h.verifyTimer); f.commands[3].done(null, onText);
  assert.equal(f.h.activated, null); assert.ok(f.h.errors.power);
  f.fire(f.h.powerRetry); f.commands[4].done(null);
  f.fire(f.h.verifyTimer); f.commands[5].done(null, offText);
  assert.equal(f.h.activated, false); assert.equal(f.h.errors.power, undefined);
 });
}
test('sensor failure keeps screen on and restart restores countdown', () => {
 const f = fixture(); f.commands[0].done(null);
 f.children[0].emit('close', 1, null);
 assert.ok(f.h.errors.sensor); assert.equal(f.tasks.has(f.h.timeout), false);
 f.fire(f.h.sensorRetry); f.children[1].stdout.write('PIR_START\n');
 assert.equal(f.h.errors.sensor, undefined); assert.ok(f.tasks.has(f.h.timeout));
});
test('sensor startup watchdog kills a process that never becomes ready', () => {
 const f = fixture(); f.children[0].emit('close', 1, null);
 f.fire(f.h.sensorRetry); f.fire(f.h.sensorWatchdog);
 assert.equal(f.children[1].killed, true); assert.ok(f.h.errors.sensor);
});
test('invalid config is visible and can be corrected', () => {
 const f = fixture({ deactivateDelay: -1 });
 assert.equal(f.children.length, 0); assert.ok(f.h.errors.config);
 f.h.socketNotificationReceived('CONFIG', { sensorPin: 2 });
 assert.equal(f.children.length, 1); assert.equal(f.h.errors.config, undefined);
});
function frontend(config = {}) {
 let value, intervals = 0;
 const element = tag => ({ tag, children: [], textContent: '', appendChild(child) { this.children.push(child); } });
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, 'MMM-PIR-Sensor-BODK.js'), 'utf8'), {
  Module: { register(name, definition) { value = definition; } }, document: { createElement: element },
  Date: { now: () => 1000 }, Number, Math, Log: { error() {}, info() {} },
  setInterval() { intervals++; return intervals; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {}
 });
 value.config = Object.assign({}, value.defaults, config);
 value.updateDom = () => {}; value.sendSocketNotification = () => {}; value.translate = x => x;
 value.start(); return { h: value, intervals: () => intervals };
}
test('hidden countdown avoids periodic redraw and detection works independently', () => {
 const f = frontend({ showCountDown: false }); f.h.loaded = true;
 f.h.resetCountdown(31000); assert.equal(f.intervals(), 0);
 f.h.socketNotificationReceived('USER_PRESENCE', true);
 const dom = f.h.getDom(); assert.equal(dom.children[0].children[0].className, 'fas fa-crosshairs bright');
});
test('24 hours is rendered correctly and errors recover', () => {
 const f = frontend(); f.h.resetCountdown(86401000); assert.equal(f.h.diffHours, 24);
 f.h.socketNotificationReceived('STATUS', { sensorReady: false, error: 'PIR unavailable' });
 assert.equal(f.h.getDom().textContent, 'PIR unavailable');
 f.h.socketNotificationReceived('STATUS', { sensorReady: true, error: '' });
 assert.equal(f.h.errorMessage, ''); assert.equal(f.h.loaded, true);
 f.h.suspend(); f.h.resume(); assert.equal(f.h.suspended, false);
});
