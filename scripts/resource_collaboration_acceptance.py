#!/usr/bin/env python3
"""Black-box acceptance for durable Farmer/Admin/System resource collaboration.

The probe uses only public HTTP/SSE contracts and never prints JWTs.  It has
three modes: a complete lifecycle, a pre-restart persistence probe, and a
post-restart verification/cleanup pass.
"""
from __future__ import annotations

import argparse
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8080").rstrip("/")
PROBE_PASSWORD = "SyncProbe2026!"


def call(method: str, path: str, token: str | None = None, body: dict[str, Any] | None = None):
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(BASE + path, data=payload, method=method)
    request.add_header("Accept", "application/json")
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8")
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, {"raw": raw}


def data(response: dict[str, Any]) -> Any:
    return response.get("data")


def error_code(response: dict[str, Any]) -> str:
    error = response.get("error") or {}
    return str(error.get("code") or response.get("code") or "")


def expect(label: str, status: int, response: dict[str, Any], wanted: int = 200) -> Any:
    if status != wanted:
        message = (response.get("error") or {}).get("message") or response.get("message") or response
        raise AssertionError(f"{label}: HTTP {status}, expected {wanted}: {message}")
    return data(response)


def login(username: str, password: str, role: str) -> dict[str, Any]:
    status, response = call("POST", "/api/v1/auth/login", body={
        "username": username, "password": password, "role": role,
    })
    return expect(f"login {role}", status, response)


def register_farmer(run_id: str) -> dict[str, Any]:
    username = f"sync_probe_{run_id}"
    status, response = call("POST", "/api/v1/auth/register", body={
        "username": username, "password": PROBE_PASSWORD, "role": "FARMER",
    })
    session = expect("register farmer", status, response, 201)
    session["probeUsername"] = username
    return session


def query(path: str, **params: str) -> str:
    values = {key: value for key, value in params.items() if value is not None and value != ""}
    return path + ("?" + urllib.parse.urlencode(values) if values else "")


def find_record(records: list[dict[str, Any]], key: str, value: str) -> dict[str, Any]:
    for record in records:
        if str(record.get(key)) == value:
            return record
    raise AssertionError(f"record {key}={value} is not visible")


class SseCollector:
    def __init__(self, name: str, token: str):
        self.name = name
        self.token = token
        self.events: list[dict[str, Any]] = []
        self.ready = threading.Event()
        self.stop_requested = threading.Event()
        self.response = None
        self.error: Exception | None = None
        self.thread = threading.Thread(target=self._run, name=f"sse-{name}", daemon=True)

    def start(self) -> None:
        self.thread.start()
        if not self.ready.wait(8):
            raise AssertionError(f"{self.name} SSE did not connect")
        if self.error:
            raise AssertionError(f"{self.name} SSE failed: {self.error}")

    def _run(self) -> None:
        request = urllib.request.Request(BASE + "/api/v1/events/stream", method="GET")
        request.add_header("Accept", "text/event-stream")
        request.add_header("Authorization", "Bearer " + self.token)
        try:
            self.response = urllib.request.urlopen(request, timeout=30)
            event_type = "message"
            event_data: list[str] = []
            self.ready.set()
            while not self.stop_requested.is_set():
                raw = self.response.readline()
                if not raw:
                    break
                line = raw.decode("utf-8").rstrip("\r\n")
                if not line:
                    if event_data:
                        joined = "\n".join(event_data)
                        try:
                            parsed: Any = json.loads(joined)
                        except json.JSONDecodeError:
                            parsed = joined
                        self.events.append({"type": event_type, "data": parsed})
                    event_type, event_data = "message", []
                elif line.startswith("event:"):
                    event_type = line.partition(":")[2].strip() or "message"
                elif line.startswith("data:"):
                    event_data.append(line.partition(":")[2].lstrip())
        except Exception as error:  # connection close during stop is expected
            if not self.stop_requested.is_set():
                self.error = error
                self.ready.set()

    def wait_for(self, required: set[str], timeout: float = 8.0) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            seen = {event["type"] for event in self.events}
            if required.issubset(seen):
                return
            if self.error:
                raise AssertionError(f"{self.name} SSE failed: {self.error}")
            time.sleep(0.1)
        seen = sorted({event["type"] for event in self.events})
        raise AssertionError(f"{self.name} SSE missing {sorted(required - set(seen))}; saw {seen}")

    def close(self) -> None:
        self.stop_requested.set()
        if self.response is not None:
            try:
                self.response.close()
            except Exception:
                pass


def assert_persistent_backend(token: str) -> str:
    status, response = call("GET", "/api/v1/system/status", token)
    system_status = expect("system status", status, response)
    persistence = str(system_status.get("persistence") or "UNKNOWN").upper()
    if persistence not in {"H2_STANDALONE", "POSTGRESQL"}:
        raise AssertionError(f"resource persistence is not durable: {persistence}")
    return persistence


def seed_plot_context(token: str, run_id: str, plot_id: str = "plot-a01") -> None:
    values = {
        "SOIL_MOISTURE": (18.0, "%"), "AIR_TEMPERATURE": (26.0, "°C"),
        "AIR_HUMIDITY": (64.0, "%RH"), "LIGHT": (38_000.0, "lux"),
        "CO2": (650.0, "ppm"), "PH": (6.3, "pH"), "WATER_LEVEL": (75.0, "%"),
    }
    now = datetime.now(timezone.utc)
    for metric, (value, unit) in values.items():
        for sample in range(2):
            status, response = call("POST", "/api/v1/telemetry", token, {
                "eventId": f"sync-{run_id}-{metric.lower()}-{sample}",
                "farmId": "farm-demo", "plotId": plot_id, "deviceId": "mock-plot-a01",
                "metric": metric, "value": value, "unit": unit,
                "ts": (now - timedelta(seconds=sample)).isoformat(),
            })
            expect(f"seed {metric}", status, response)


def create_probe_request(farmer: dict[str, Any], run_id: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    status, response = call("POST", "/api/v1/resource-requests", farmer["accessToken"], {
        "farmId": "farm-demo", "plotId": "plot-a01", "requestedLitres": 42.0,
        "preferredStart": (now + timedelta(minutes=30)).isoformat(),
        "preferredEnd": (now + timedelta(hours=2)).isoformat(),
        "constraints": "V5.9 三账号 HTTP 验收", "note": f"sync probe {run_id}",
    })
    return expect("farmer creates resource request", status, response)


def visible_request(token: str, request_id: str, role: str) -> dict[str, Any]:
    status, response = call("GET", query("/api/v1/resource-requests", farmId="farm-demo"), token)
    records = expect(f"{role} lists resource requests", status, response)
    return find_record(records, "resourceRequestId", request_id)


def cleanup_probe(farmer: dict[str, Any], admin: dict[str, Any], system: dict[str, Any], request_id: str, plan_id: str | None = None) -> None:
    if plan_id:
        status, response = call("POST", f"/api/v1/resource-plans/{plan_id}/cancel", admin["accessToken"], {})
        if status not in {200, 409}:
            expect("cancel probe resource plan", status, response)
    status, response = call("POST", f"/api/v1/resource-requests/{request_id}/actions", farmer["accessToken"], {
        "action": "WITHDRAW", "note": "acceptance cleanup",
    })
    if status not in {200, 409}:
        expect("withdraw probe request", status, response)
    user_id = str((farmer.get("user") or {}).get("userId") or farmer.get("userId") or "")
    if user_id:
        status, response = call("DELETE", f"/api/v1/users/{user_id}", system["accessToken"])
        if status not in {200, 404}:
            expect("delete probe farmer", status, response)


def lifecycle() -> dict[str, Any]:
    run_id = uuid.uuid4().hex[:10]
    farmer = register_farmer(run_id)
    other_farmer = register_farmer("other_" + run_id)
    admin = login("admin", "demo123", "FARM_ADMIN")
    system = login("sysadmin", "demo123", "SYSTEM_ADMIN")
    persistence = assert_persistent_backend(system["accessToken"])

    status, response = call("GET", query("/api/v1/resource-requests", farmId="farm-other"), admin["accessToken"])
    if status != 403 or error_code(response) != "FARM_FORBIDDEN":
        raise AssertionError("FARM_ADMIN could read another farm")
    status, response = call("POST", "/api/v1/resource-plans/evaluate", system["accessToken"], {
        "mode": "AUTO", "farmId": "farm-demo",
    })
    if status != 403 or error_code(response) != "RESOURCE_PLAN_FORBIDDEN":
        raise AssertionError("SYSTEM_ADMIN unexpectedly received resource write permission")

    collectors = [
        SseCollector("farmer", farmer["accessToken"]),
        SseCollector("farm-admin", admin["accessToken"]),
        SseCollector("system-admin", system["accessToken"]),
    ]
    plan_id = None
    request_id = None
    other_request_id = None
    try:
        for collector in collectors:
            collector.start()
        seed_plot_context(admin["accessToken"], run_id)
        other_request = create_probe_request(other_farmer, "other-" + run_id)
        other_request_id = str(other_request["resourceRequestId"])
        status, response = call("GET", query("/api/v1/resource-requests", farmId="farm-demo"), farmer["accessToken"])
        farmer_visible = expect("Farmer lists only own requests", status, response)
        if any(str(record.get("resourceRequestId")) == other_request_id for record in farmer_visible):
            raise AssertionError("FARMER could read another farmer's resource request")
        visible_request(system["accessToken"], other_request_id, "SYSTEM_ADMIN")
        time.sleep(0.3)
        leaked_events = [
            event for event in collectors[0].events
            if str((event.get("data") or {}).get("payload", {}).get("resourceRequestId")) == other_request_id
        ]
        if leaked_events:
            raise AssertionError("FARMER received another farmer's resource-request SSE event")

        request_record = create_probe_request(farmer, run_id)
        request_id = str(request_record["resourceRequestId"])
        for role, session in (("FARMER", farmer), ("FARM_ADMIN", admin), ("SYSTEM_ADMIN", system)):
            shared = visible_request(session["accessToken"], request_id, role)
            if int(shared.get("revision", 0)) != int(request_record.get("revision", 0)):
                raise AssertionError(f"{role} saw a different request revision")

        status, response = call("POST", "/api/v1/resource-plans/evaluate", admin["accessToken"], {
            "mode": "AUTO", "farmId": "farm-demo",
        })
        plan = expect("farm admin generates resource plan", status, response)
        plan_id = str(plan["resourcePlanId"])
        allocation = next((row for row in plan.get("allocations", []) if request_id in row.get("resourceRequestIds", [])), None)
        if allocation is None:
            raise AssertionError("generated plan did not include the Farmer request")

        status, response = call("PATCH", f"/api/v1/resource-plans/{plan_id}", admin["accessToken"], {
            "expectedRevision": int(plan.get("revision", 1)) + 1,
            "reason": "verify optimistic locking", "adjustments": [],
        })
        if status != 409 or error_code(response) != "RESOURCE_PLAN_VERSION_CONFLICT":
            raise AssertionError("stale resource plan revision was not rejected")

        idempotency_key = f"sync-confirm-{run_id}"
        status, response = call("POST", f"/api/v1/resource-plans/{plan_id}/confirm", admin["accessToken"], {
            "expectedRevision": plan.get("revision", 1), "idempotencyKey": idempotency_key,
        })
        confirmed = expect("farm admin confirms resource plan", status, response)
        status, response = call("POST", f"/api/v1/resource-plans/{plan_id}/confirm", admin["accessToken"], {
            "expectedRevision": plan.get("revision", 1), "idempotencyKey": idempotency_key,
        })
        repeated = expect("idempotent confirm", status, response)
        if repeated.get("revision") != confirmed.get("revision"):
            raise AssertionError("idempotent confirmation changed the plan revision")

        pending = visible_request(farmer["accessToken"], request_id, "FARMER")
        if pending.get("status") != "PENDING_ACK":
            raise AssertionError(f"Farmer did not receive pending allocation: {pending.get('status')}")
        status, response = call("POST", f"/api/v1/resource-requests/{request_id}/actions", farmer["accessToken"], {
            "action": "ACKNOWLEDGE", "note": "现场可执行",
        })
        acknowledged = expect("farmer acknowledges allocation", status, response)
        audited = visible_request(system["accessToken"], request_id, "SYSTEM_ADMIN")
        if audited.get("status") != "ACKNOWLEDGED" or audited.get("revision") != acknowledged.get("revision"):
            raise AssertionError("SYSTEM_ADMIN did not observe the same request revision/status")
        if len(audited.get("history") or []) < 4:
            raise AssertionError("request lifecycle history is incomplete")

        required = {"resource.request.created", "resource.request.allocated", "resource.request.acknowledge"}
        for collector in collectors:
            collector.wait_for(required)
        return {
            "status": "PASS", "mode": "lifecycle", "persistence": persistence,
            "requestId": request_id, "requestRevision": acknowledged.get("revision"),
            "planId": plan_id, "planRevision": confirmed.get("revision"),
            "sse": {collector.name: sorted({event["type"] for event in collector.events if event["type"].startswith("resource.")}) for collector in collectors},
        }
    finally:
        for collector in collectors:
            collector.close()
        if request_id:
            cleanup_probe(farmer, admin, system, request_id, plan_id)
        if other_request_id:
            cleanup_probe(other_farmer, admin, system, other_request_id)


def prepare_restart(state_file: Path) -> dict[str, Any]:
    run_id = uuid.uuid4().hex[:10]
    farmer = register_farmer(run_id)
    system = login("sysadmin", "demo123", "SYSTEM_ADMIN")
    persistence = assert_persistent_backend(system["accessToken"])
    request_record = create_probe_request(farmer, run_id)
    state = {
        "username": farmer["probeUsername"], "password": PROBE_PASSWORD,
        "userId": (farmer.get("user") or {}).get("userId") or farmer.get("userId"),
        "requestId": request_record["resourceRequestId"], "revision": request_record["revision"],
    }
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "PASS", "mode": "prepare-restart", "persistence": persistence, "requestId": state["requestId"], "stateFile": str(state_file)}


def verify_restart(state_file: Path) -> dict[str, Any]:
    state = json.loads(state_file.read_text(encoding="utf-8"))
    farmer = login(state["username"], state["password"], "FARMER")
    admin = login("admin", "demo123", "FARM_ADMIN")
    system = login("sysadmin", "demo123", "SYSTEM_ADMIN")
    persistence = assert_persistent_backend(system["accessToken"])
    records = {
        role: visible_request(session["accessToken"], state["requestId"], role)
        for role, session in (("FARMER", farmer), ("FARM_ADMIN", admin), ("SYSTEM_ADMIN", system))
    }
    if any(int(record.get("revision", 0)) != int(state["revision"]) for record in records.values()):
        raise AssertionError("request revision changed across API restart")
    cleanup_probe(farmer, admin, system, state["requestId"])
    state_file.unlink(missing_ok=True)
    return {"status": "PASS", "mode": "verify-restart", "persistence": persistence, "requestId": state["requestId"], "roles": sorted(records)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("lifecycle", "prepare-restart", "verify-restart"), nargs="?", default="lifecycle")
    parser.add_argument("--state-file", type=Path, default=Path("data/resource-sync-restart-probe.json"))
    args = parser.parse_args()
    result = lifecycle() if args.mode == "lifecycle" else prepare_restart(args.state_file) if args.mode == "prepare-restart" else verify_restart(args.state_file)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001 - acceptance emits one concise result
        print(json.dumps({"status": "FAIL", "error": str(error)}, ensure_ascii=False))
        raise
