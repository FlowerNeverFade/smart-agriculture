"""Lightweight, reproducible acceptance checks for the Task 5 web modules.

This is intentionally dependency-free: it validates the static wiring and
asks Node to parse each ES module. Browser-level interaction remains a manual
check because the project ships as a no-build vanilla ES module application.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web-ui"


def require(path: Path, needles: list[str]) -> None:
    if not path.exists():
        raise AssertionError(f"missing file: {path}")
    text = path.read_text(encoding="utf-8")
    for needle in needles:
        if needle not in text:
            raise AssertionError(f"{path}: missing {needle!r}")


def main() -> int:
    require(
        WEB / "index.html",
        ["css/modules/task5.css", "data-view=\"risk-forecast\"", "data-view=\"scenario-replay\"", "data-view=\"value-ledger\""],
    )
    require(WEB / "js/app.js", ["renderRiskForecast", "renderScenarioReplay", "renderValueLedger", "task5-modal"])
    require(WEB / "js/api.js", ["getRiskForecast", "runScenario", "compareScenario", "getValueLedgers", "createValueLedger"])
    require(WEB / "js/modules/task5-utils.js", ["seededRandom", "buildScenarioSeries"])
    require(WEB / "js/modules/risk-forecast.js", ["Time-to-Risk", "UNAVAILABLE", "data-scenario"])
    require(WEB / "js/modules/scenario-replay.js", ["EXECUTE", "NO_ACTION", "snapshotHash", "data-replay-slider"])
    require(WEB / "js/modules/value-ledger.js", ["USER_PROVIDED", "OBSERVED", "SIMULATED", "baselineWaterLitres"])
    require(WEB / "css/modules/task5.css", [".task5-modal", ".task5-replay-chart-card", ".task5-ledger-disclosure", "@keyframes task5Spin"])

    node = shutil.which("node")
    if not node:
        raise AssertionError("Node.js is required for ES module syntax checks")
    js_files = [
        WEB / "js/app.js",
        WEB / "js/api.js",
        WEB / "js/modules/task5-utils.js",
        WEB / "js/modules/risk-forecast.js",
        WEB / "js/modules/scenario-replay.js",
        WEB / "js/modules/value-ledger.js",
    ]
    for js_file in js_files:
        result = subprocess.run([node, "--check", str(js_file)], capture_output=True, text=True)
        if result.returncode:
            raise AssertionError(f"node --check failed for {js_file}: {result.stderr.strip()}")

    # A cheap contract sanity check catches accidental removal of the three
    # live endpoint strings during later refactors.
    api_text = (WEB / "js/api.js").read_text(encoding="utf-8")
    for endpoint in ("/api/v1/plots/", "/risk-forecast", "/api/v1/scenarios/runs", "/api/v1/scenarios/compare", "/api/v1/value-ledgers"):
        if endpoint not in api_text:
            raise AssertionError(f"api contract missing: {endpoint}")

    print("TASK5_FRONTEND_STATIC_OK")
    print(f"checked {len(js_files)} JavaScript modules and task5 route wiring")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"TASK5_FRONTEND_STATIC_FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
