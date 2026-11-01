#!/usr/bin/env python3
"""PIR reader, based on MMM-PIR-Sensor-Lite by Grena (MIT)."""
import argparse
import signal
import time


def shutdown(signum, frame):
    raise SystemExit(0)


def monitor(gpio, pin, sleep=time.sleep, clock=time.monotonic, emit=print):
    """Poll frequently; refresh presence at most twice a second while high."""
    try:
        gpio.setmode(gpio.BCM)
        gpio.setup(pin, gpio.IN)
        sleep(2)
        emit("PIR_START", flush=True)
        last_presence = float("-inf")
        while True:
            now = clock()
            if gpio.input(pin) and now - last_presence >= 0.5:
                emit("USER_PRESENCE", flush=True)
                last_presence = now
            sleep(0.1)
    finally:
        gpio.cleanup(pin)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pin", type=int, choices=range(1, 28), help="BCM GPIO pin (1-27)")
    args = parser.parse_args()
    import RPi.GPIO as GPIO
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    monitor(GPIO, args.pin)


if __name__ == "__main__":
    main()
