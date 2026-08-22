#!/usr/bin/env python3
"""Deterministic, dependency-free Crop Pack contract check."""
from __future__ import annotations

import json
from pathlib import Path

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover - clean fallback environment
    yaml = None


ROOT = Path(__file__).resolve().parents[1]
PACK_ROOTS = [ROOT / "crop-packs", ROOT / "apps" / "api-service" / "src" / "main" / "resources" / "crop-packs"]
REQUIRED_SCENARIOS = {"normal", "drought", "heavy-rain", "sensor-drift", "device-offline"}
REQUIRED_METRICS = {"SOIL_MOISTURE", "AIR_TEMPERATURE", "LIGHT", "CO2", "PH", "WATER_LEVEL"}


def load_yaml(path: Path) -> dict:
    # Crop Pack files intentionally use a JSON-compatible YAML subset so the
    # validator stays usable in a clean Python environment.
    text = path.read_text(encoding="utf-8")
    if yaml is not None:
        value = yaml.safe_load(text)
        return value if isinstance(value, dict) else {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        values: dict[str, object] = {"_raw": text}
        for line in text.splitlines():
            if not line.strip() or line.lstrip().startswith("#") or line.startswith(" "):
                continue
            key, _, value = line.partition(":")
            if key:
                values[key.strip()] = value.strip().strip("\"'") if value else []
    # A minimal fallback is enough for the contract check when PyYAML is not
    # installed: recover the required metric/scenario identifiers from their
    # inline YAML forms rather than silently treating nested blocks as absent.
    import re
    values["metrics"] = re.findall(r"(?:code:\s*|\{code:\s*)([A-Z][A-Z0-9_]+)", text)
    values["scenarios"] = {name: {} for name in re.findall(r"^\s{2}([a-z-]+):", text, re.MULTILINE)}
    return values


def validate(pack: dict, path: Path) -> list[str]:
    errors: list[str] = []
    raw = str(pack.get("_raw", ""))
    for key in ("cropCode", "version", "stages", "metrics", "rules", "scenarios"):
        if key not in pack:
            if f"\n{key}:" not in raw and not raw.startswith(f"{key}:"):
                errors.append(f"{path}: missing {key}")
    if not isinstance(pack.get("stages"), list) or not pack["stages"]:
        if "stages:" not in raw:
            errors.append(f"{path}: stages must be non-empty")
    if not pack.get("metrics") and "metrics:" not in raw:
        errors.append(f"{path}: metrics must be non-empty")
    if not pack.get("rules") and "rules:" not in raw:
        errors.append(f"{path}: rules must be non-empty")
    if not isinstance(pack.get("stages"), list) and "stages:" not in raw:
        errors.append(f"{path}: stages must be non-empty")
    metrics = {m.get("code") if isinstance(m, dict) else m for m in pack.get("metrics", [])}
    missing = REQUIRED_METRICS - metrics
    if missing:
        errors.append(f"{path}: missing metrics {sorted(missing)}")
    scenarios = set(pack.get("scenarios", {}).keys()) if isinstance(pack.get("scenarios"), dict) else set()
    missing_scenarios = REQUIRED_SCENARIOS - scenarios
    if missing_scenarios:
        errors.append(f"{path}: missing scenarios {sorted(missing_scenarios)}")
    return errors


def main() -> int:
    errors: list[str] = []
    seen: set[str] = set()
    for root in PACK_ROOTS:
        for path in sorted(root.glob("*/pack.yaml")):
            pack = load_yaml(path)
            code = str(pack.get("cropCode", path.parent.name))
            if root == PACK_ROOTS[0]:
                seen.add(code)
            errors.extend(validate(pack, path))
    if seen != {"tomato", "cucumber"}:
        errors.append(f"expected tomato and cucumber packs, found {sorted(seen)}")
    if errors:
        for error in errors:
            print(error)
        return 1
    print("crop packs: PASS (tomato, cucumber; 6 metrics; required scenarios)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
