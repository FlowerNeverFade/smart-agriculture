import argparse
import unittest

from hardware.bearpi_e53_bridge import (
    Publisher,
    make_event,
    parse_actuator_ack,
    parse_actuator_state,
    parse_line,
    parse_lines,
)


class BearPiParserTest(unittest.TestCase):
    def test_official_e53_lines(self):
        self.assertEqual(parse_line("Lux Value is 53.33"), [("LIGHT", 53.33, "lux")])
        self.assertEqual(parse_line("Humidity is 44.10"), [("AIR_HUMIDITY", 44.10, "%RH")])
        self.assertEqual(parse_line("Temperature is 28.13"), [("AIR_TEMPERATURE", 28.13, "°C")])

    def test_json_line_and_at_noise(self):
        self.assertEqual(
            parse_line('{"temperature":26.1,"humidity":63.2,"lux":48000}'),
            [("AIR_TEMPERATURE", 26.1, "°C"), ("AIR_HUMIDITY", 63.2, "%RH"), ("LIGHT", 48000.0, "lux")],
        )
        self.assertEqual(parse_line("AT+IFCFG"), [])

    def test_event_is_explicitly_real_hardware(self):
        args = argparse.Namespace(farm_id="farm-demo", plot_id="plot-a01", device_id="bearpi-test")
        event = make_event("AIR_HUMIDITY", 63.2, "%RH", args, "2026-08-26T00:00:00Z")
        self.assertEqual(event["sourceMode"], "REAL")
        self.assertEqual(event["dataOrigin"], "HARDWARE")
        self.assertEqual(event["unit"], "%RH")

    def test_parse_lines_keeps_sample_order(self):
        self.assertEqual(
            [metric for metric, _value, _unit in parse_lines(["Temperature is 25", "Humidity is 70"])],
            ["AIR_TEMPERATURE", "AIR_HUMIDITY"],
        )

    def test_device_control_stops_and_restores_bearpi_publishing(self):
        args = argparse.Namespace(mqtt=False, farm_id="farm-demo", plot_id="plot-a01", device_id="bearpi-test")
        publisher = Publisher(args)
        assert publisher.offline is False
        ack = publisher.apply_control_payload({"commandId": "cmd-1", "deviceId": "bearpi-test", "targetStatus": "OFFLINE"})
        assert ack["status"] == "SUCCEEDED"
        assert publisher.offline is True
        publisher.apply_control_payload({"commandId": "cmd-2", "deviceId": "bearpi-test", "targetStatus": "ONLINE"})
        assert publisher.offline is False
        assert publisher.apply_control_payload({"deviceId": "other", "targetStatus": "OFFLINE"}) is None

    def test_firmware_control_lines_are_strictly_parsed(self):
        self.assertEqual(
            parse_actuator_ack("AGRI_ACK cmd-1 LIGHT ON SUCCEEDED APPLIED"),
            {"command_id": "cmd-1", "actuator": "GROW_LIGHT", "state": "ON", "status": "SUCCEEDED", "reason": "APPLIED"},
        )
        self.assertEqual(
            parse_actuator_state("AGRI_STATE FAN OFF LIGHT ON REASON PERIODIC"),
            {"FAN": "OFF", "GROW_LIGHT": "ON", "reason": "PERIODIC"},
        )
        self.assertIsNone(parse_actuator_ack("fan is now on"))

    def test_actuator_command_waits_for_real_firmware_ack(self):
        class SerialCapture:
            def __init__(self):
                self.written = bytearray()

            def write(self, value):
                self.written.extend(value)

            def flush(self):
                return None

        args = argparse.Namespace(mqtt=False, farm_id="farm-demo", plot_id="plot-a01", device_id="bearpi-test")
        publisher = Publisher(args)
        immediate = publisher.apply_control_payload({
            "commandId": "cmd-remote-1", "deviceId": "bearpi-test", "type": "FAN_SET",
            "targetState": "ON", "durationSeconds": 30,
        })
        self.assertIsNone(immediate)
        self.assertEqual(publisher.actuator_status()["FAN"]["status"], "PENDING")
        serial_capture = SerialCapture()
        publisher.flush_serial_commands(serial_capture)
        self.assertEqual(
            bytes(serial_capture.written),
            b"AT+AGRI=cmd-remote-1,FAN,ON,30\r\n",
        )
        self.assertTrue(publisher.handle_serial_line("AGRI_ACK cmd-remote-1 FAN ON SUCCEEDED APPLIED"))
        self.assertEqual(publisher.actuator_status()["FAN"]["state"], "ON")
        self.assertEqual(publisher.actuator_status()["FAN"]["status"], "SUCCEEDED")

    def test_zero_duration_is_reserved_for_continuous_grow_light(self):
        class SerialCapture:
            def __init__(self):
                self.written = bytearray()

            def write(self, value):
                self.written.extend(value)

            def flush(self):
                return None

        args = argparse.Namespace(mqtt=False, farm_id="farm-demo", plot_id="plot-a01", device_id="bearpi-test")
        publisher = Publisher(args)
        self.assertIsNone(publisher.apply_control_payload({
            "commandId": "light-continuous", "deviceId": "bearpi-test", "type": "LIGHT_SET",
            "targetState": "ON", "durationSeconds": 0,
        }))
        serial_capture = SerialCapture()
        publisher.flush_serial_commands(serial_capture)
        self.assertEqual(bytes(serial_capture.written), b"AT+AGRI=light-continuous,LIGHT,ON,0\r\n")
        fan = publisher.apply_control_payload({
            "commandId": "fan-unbounded", "deviceId": "bearpi-test", "type": "FAN_SET",
            "targetState": "ON", "durationSeconds": 0,
        })
        self.assertEqual(fan["status"], "FAILED")
        self.assertEqual(fan["reason"], "INVALID_COMMAND")


if __name__ == "__main__":
    unittest.main()
