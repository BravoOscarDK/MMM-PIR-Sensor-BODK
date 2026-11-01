# MMM-PIR-Sensor-BODK

MagicMirror² module for switching a monitor off after inactivity and waking it when a PIR sensor detects presence. Local continuation of [MMM-PIR-Sensor-Lite by Grena](https://github.com/grenagit/MMM-PIR-Sensor-Lite), licensed under MIT. The original copyright is retained in LICENSE.

## Installation

The BODK repository has not been published yet. Copy this complete folder to your Pi as:

```text
~/MagicMirror/modules/MMM-PIR-Sensor-BODK
```

Keep that folder name and `MMM-PIR-Sensor-BODK.js` unchanged. This module has no npm dependencies, so `npm install` is unnecessary. Python 3, a working `RPi.GPIO` installation and the selected display command must already be available. If the original module works on your Pi, keep its working GPIO and display environment.

Remove or disable the original Lite module configuration before enabling BODK, so two modules do not control the same sensor and monitor. Keep a copy of the original module for rollback. Restart MagicMirror after copying the files and changing its configuration.

Do not use `git pull` to obtain BODK changes from the original repository: it does not contain these changes. Until publication, updates are deployed by copying the updated local files.

## Configuration

Add this entry to the `modules` array in `config/config.js`, retaining your existing pin, output and command settings:

```javascript
{
  module: "MMM-PIR-Sensor-BODK",
  position: "top_right",
  config: {
    sensorPin: 2,
    commandType: "xrandr",
    hdmiPort: "HDMI-1",
    deactivateDelay: 15 * 60 * 1000,
    verifyPower: true
  }
}
```

Pins use BCM numbering, not physical header positions. Only one sensor/display configuration per module helper is supported.

| Option | Default | Meaning |
| --- | --- | --- |
| `sensorPin` | `0` | Required BCM pin, integer 1-27. Zero indicates missing configuration. |
| `commandType` | `"xrandr"` | `"xrandr"`, `"xset"` or `"vcgencmd"`. Retain the command working on your Pi. |
| `hdmiPort` | `"HDMI-1"` | Exact output name for xrandr; use `xrandr --query` to list outputs. |
| `rotation` | `"normal"` | xrandr rotation: normal, left, right or inverted. |
| `deactivateDelay` | `900000` | Inactivity period in milliseconds, integer 1000-86400000. |
| `verifyPower` | `true` | Query display output state after each command; retry on failure or mismatch. |
| `debugMode` | `false` | Simulate display changes without running display commands. Sensor still runs. |
| `title` | `"Automatic Standby"` | Countdown title; empty string hides it. |
| `showCountDown` | `true` | Display countdown; disabling it stops periodic UI updates. |
| `showDetection` | `true` | Show detection icon independently of the countdown. |
| `updateInterval` | `1000` | UI refresh milliseconds; clamped to 100-5000; zero uses 1000. |
| `animationSpeed` | `1000` | MagicMirror animation duration; detection icon lasts at least 100 ms. |
| `hoursLabel` | `"h"` | Hours label. |
| `minutesLabel` | `"m"` | Minutes label. |
| `secondsLabel` | `"s"` | Seconds label. |

## Reliability and limitations

The sensor stabilizes for two seconds before announcing readiness. GPIO is polled every 100 ms and presence is reported approximately every 500 ms while the input is high. The inactivity timer starts after sensor readiness and resets with each presence message. A sensor that remains high will keep the screen on, even if a person has already left; the PIR's own hold time is part of this behaviour.

Display commands run sequentially. Movement during a pending switch-off queues a switch-on. Each command has a 10-second timeout; failures are logged and retried after five seconds without requiring new movement. The query runs after a 300 ms settling period and uses `xrandr --query`, `xset q` or `vcgencmd display_power`. This checks the software-reported output state, not the physical panel or its power consumption. There is no continuous monitoring of changes made by other programs.

If a query is unsupported on an otherwise working setup, the module displays a verification error. Set `verifyPower: false` to retain command exit-code checks and retries without the extra query. Capture the error before disabling verification so it can be investigated.

An exited sensor is restarted after five seconds. A sensor process that has not reported readiness within 15 seconds is terminated for restart. During a sensor outage the inactivity timer is cancelled and the screen is kept on, so a failed sensor does not leave it asleep. Sensor and display errors appear in the module and server log. Shutdown clears backend timers and terminates child processes; hiding the module stops its UI timers while presence detection continues.

This release retains the existing RPi.GPIO and display backends. It does not add native Wayland control or a new Raspberry Pi 5 GPIO backend. Hardware compatibility must be tested on the target Pi. Core project: [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror).

## Test on your Pi

1. Back up your current module and config. Copy BODK and enable only the BODK config entry.
2. Temporarily use `deactivateDelay: 30000`, retaining your working sensorPin, commandType and hdmiPort.
3. Wait for the countdown, then leave the sensor area. Check that the screen switches off after the PIR signal has gone low and the delay expires.
4. Move in front of the sensor and confirm that the screen wakes and the countdown restarts. Repeat at least ten times, including movement near the moment of switch-off.
5. If it fails, save the MagicMirror server log lines containing `MMM-PIR-Sensor-BODK`, especially `Monitor off failed`, and note whether the countdown reached zero.
6. Restore your normal delay when finished.

Standalone sensor check (stop MagicMirror first to avoid simultaneous GPIO access):

```sh
python3 -u ~/MagicMirror/modules/MMM-PIR-Sensor-BODK/pir.py 2
```

Replace `2` with your BCM pin. Expect `PIR_START` after stabilization and `USER_PRESENCE` while the signal is high. Ctrl+C releases the selected pin.

## Automated tests

```sh
npm test
python3 -B -m unittest -v test_pir.py
```

Tests simulate command failures, verification mismatches for all three display backends, overlapping requests, repeated on/off cycles, startup watchdog, restart, cleanup, configuration errors, countdown display and GPIO polling. They do not operate a physical monitor or GPIO.
