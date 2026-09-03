#!/usr/bin/env python3
"""Create a reproducible ZIP while retaining executable bits for shell scripts.

The delivery build runs on Windows, where the built-in archive cmdlets do not
preserve Unix mode bits.  This small, dependency-free helper writes the mode
in the ZIP external attributes so Linux unpackers see ``bin/*.sh`` as
executable.  It is also used for the source archive to keep archive creation
consistent.
"""

from __future__ import annotations

import argparse
import os
import stat
import zipfile
from pathlib import Path


def archive_mode(path: Path) -> int:
    if path.is_dir():
        return stat.S_IFDIR | 0o755
    if path.suffix == ".sh" or path.name.endswith(".bash"):
        return stat.S_IFREG | 0o755
    return stat.S_IFREG | 0o644


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="directory whose contents are archived")
    parser.add_argument("output", type=Path, help="ZIP file to create")
    args = parser.parse_args()

    root = args.root.resolve()
    output = args.output.resolve()
    if not root.is_dir():
        parser.error(f"root directory does not exist: {root}")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    entries = sorted((p for p in root.rglob("*") if p.is_file()), key=lambda p: p.relative_to(root).as_posix())
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in entries:
            relative = path.relative_to(root).as_posix()
            info = zipfile.ZipInfo(relative)
            # DOS epoch makes the archive byte-stable between builds.
            info.date_time = (1980, 1, 1, 0, 0, 0)
            info.create_system = 3
            info.external_attr = archive_mode(path) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    print(f"created {output} ({len(entries)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
