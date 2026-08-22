#!/usr/bin/env python3
"""Small black-box acceptance probe for the deployed API.

It deliberately uses only the public REST contract and never prints the JWT.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8080").rstrip("/")


def call(method: str, path: str, token: str | None = None, body: dict | None = None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            payload = response.read().decode()
            return response.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode()
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = {"raw": payload}
        return exc.code, parsed


def assert_status(label: str, actual: int, expected: int = 200):
    if actual != expected:
        raise AssertionError(f"{label}: HTTP {actual}, expected {expected}")


def main() -> int:
    # Keep the probe safely re-runnable against a persistent remote database.
    # The duplicate assertion below still reuses the exact same event, while
    # separate invocations get a fresh namespace and therefore exercise the
    # healthy-data/readiness path instead of intentionally hitting old rows.
    run_id = uuid.uuid4().hex[:10]
    status, login = call("POST", "/api/v1/auth/login", body={"username": "admin", "password": "demo123"})
    assert_status("login", status)
    token = login["data"]["accessToken"]

    for path in ("/actuator/health", "/api/v1/system/status", "/api/v1/overview", "/api/v1/crop-packs", "/api/v1/farms", "/api/v1/plots"):
        status, _ = call("GET", path, token if path.startswith("/api") and path != "/actuator/health" else None)
        assert_status(path, status)

    now = datetime.now(timezone.utc)
    events = []
    for index in range(12):
        event = {
            "eventId": f"acceptance-{run_id}-plot-a02-{index}",
            "farmId": "farm-demo",
            "plotId": "plot-a02",
            "deviceId": "mock-plot-a02",
            "metric": "SOIL_MOISTURE",
            "value": 17.0 - index * 0.08,
            "unit": "%",
            "ts": (now - timedelta(seconds=index * 5)).isoformat(),
            "scenarioId": "normal",
        }
        status, result = call("POST", "/api/v1/telemetry", token, event)
        assert_status("telemetry", status)
        events.append(result)

    status, duplicate = call("POST", "/api/v1/telemetry", token, event)
    assert_status("duplicate telemetry", status)
    if duplicate["data"].get("duplicate") is not True:
        raise AssertionError("duplicate telemetry was accepted twice")

    status, diagnosis = call("POST", "/api/v1/diagnoses/evaluate", token, {"plotId": "plot-a02"})
    assert_status("diagnosis", status)
    if diagnosis["data"].get("primaryCause") not in {"WATER_DEFICIT", "SENSOR_DRIFT"}:
        raise AssertionError("unexpected diagnosis cause")

    status, plan = call("POST", "/api/v1/irrigation/estimate", token, {"plotId": "plot-a02"})
    assert_status("irrigation plan", status)
    plan_data = plan["data"]
    if plan_data.get("readinessStatus") != "READY" or plan_data.get("executable") is not True:
        raise AssertionError(f"healthy plan did not become READY: {plan_data.get('readinessStatus')}")

    status, forecast = call("POST", "/api/v1/forecasts/evaluate", token, {"plotId": "plot-a02", "metric": "SOIL_MOISTURE"})
    assert_status("forecast", status)
    if forecast["data"].get("status") != "AVAILABLE":
        raise AssertionError("forecast unexpectedly unavailable")

    status, resource = call("POST", "/api/v1/resource-plans/evaluate", token, {"demands": [
        {"plotId": "plot-a01", "waterLitre": 800, "priority": "HIGH"},
        {"plotId": "plot-a02", "waterLitre": 800, "priority": "MEDIUM"},
    ]})
    assert_status("resource plan", status)
    if resource["data"].get("status") != "INFEASIBLE":
        raise AssertionError("over-capacity resource plan was not rejected")

    key = f"acceptance-command-once-{run_id}"
    command_body = {"plotId": "plot-a02", "planId": plan_data["planId"], "approved": True, "idempotencyKey": key, "outcome": "FAILED"}
    status, command = call("POST", "/api/v1/commands/virtual", token, command_body)
    assert_status("command", status)
    command_id = command["data"]["commandId"]
    status, duplicate_command = call("POST", "/api/v1/commands/virtual", token, command_body)
    assert_status("duplicate command", status)
    if duplicate_command["data"].get("commandId") != command_id:
        raise AssertionError("idempotency key created a second command")

    # The virtual executor is asynchronous; wait briefly for its non-success ACK/effect.
    time.sleep(1.5)
    status, evaluation = call("GET", f"/api/v1/commands/{command_id}/evaluation", token)
    assert_status("effect evaluation", status)
    if evaluation["data"].get("status") not in {"INCONCLUSIVE", "PENDING"}:
        raise AssertionError("failed execution was incorrectly marked successful")

    status, passport = call("GET", f"/api/v1/decision-passports/{command_data_trace(command)}", token)
    assert_status("decision passport", status)

    status, scenario = call("POST", "/api/v1/scenarios/runs", token, {"scenario": "drought", "scenarioId": "acceptance-drought", "seed": 42, "branchId": "NO_ACTION", "generateSample": True})
    assert_status("scenario run", status)

    print(json.dumps({
        "status": "PASS",
        "telemetryAccepted": len(events),
        "duplicateTelemetry": duplicate["data"].get("duplicate"),
        "diagnosis": diagnosis["data"].get("primaryCause"),
        "readiness": plan_data.get("readinessStatus"),
        "commandId": command_id,
        "effectStatus": evaluation["data"].get("status"),
        "scenarioRunId": scenario["data"].get("runId"),
    }, ensure_ascii=False))
    return 0


def command_data_trace(command: dict) -> str:
    # The command API intentionally keeps trace linkage optional; use the stable
    # generated command id as a passport lookup key for the acceptance probe.
    return command["data"].get("traceId", command["data"].get("commandId", "missing"))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 - smoke probe should report one concise failure
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        raise
