"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const windows = process.platform === "win32";
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error || result.status !== 0) {
    console.error("Python setup failed. Install Python 3 with venv/pip support, then run npm install again.");
    process.exit(1);
  }
}
run(process.env.PYTHON || (windows ? "python" : "python3"), ["-m", "venv", "--system-site-packages", ".venv"]);
run(path.join(root, ".venv", windows ? "Scripts/python.exe" : "bin/python"), ["-m", "pip", "install", "-r", "requirements.txt"]);
