import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('pir', pathlib.Path(__file__).with_name('pir.py'))
pir = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pir)


class FakeGPIO:
    BCM, IN = 11, 1
    def setmode(self, mode): pass
    def setup(self, pin, mode): pass
    def input(self, pin): return self.now < 3.2
    def cleanup(self, pin): self.cleaned = pin


class SensorTest(unittest.TestCase):
    def test_continuous_presence_and_cleanup(self):
        gpio = FakeGPIO()
        gpio.now = 0
        events = []
        def sleep(delay):
            gpio.now += delay
            if gpio.now >= 4:
                raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            pir.monitor(gpio, 2, sleep=sleep, clock=lambda: gpio.now,
                        emit=lambda text, **kwargs: events.append((gpio.now, text)))
        presence = [at for at, text in events if text == 'USER_PRESENCE']
        self.assertEqual(events[0][1], 'PIR_START')
        self.assertGreaterEqual(len(presence), 3)
        self.assertTrue(all(b-a < 0.7 for a, b in zip(presence, presence[1:])))
        self.assertTrue(all(at < 3.2 for at in presence))
        self.assertEqual(gpio.cleaned, 2)

    def test_setup_failure_cleans_only_configured_pin(self):
        gpio = FakeGPIO()
        def fail(pin, mode): raise RuntimeError('GPIO unavailable')
        gpio.setup = fail
        with self.assertRaises(RuntimeError): pir.monitor(gpio, 17)
        self.assertEqual(gpio.cleaned, 17)


if __name__ == '__main__':
    unittest.main()
