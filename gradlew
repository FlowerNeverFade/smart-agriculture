#!/usr/bin/env bash
set -euo pipefail
VERSION="8.10.2"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
if command -v gradle >/dev/null 2>&1; then exec gradle "$@"; fi
CACHE_DIR="${GRADLE_USER_HOME:-$HOME/.gradle}/agriloop-distributions"
DIST="$CACHE_DIR/gradle-$VERSION"
if [ ! -x "$DIST/bin/gradle" ]; then
  mkdir -p "$CACHE_DIR"
  TMP="$CACHE_DIR/gradle-$VERSION-bin.zip"
  if [ ! -f "$TMP" ] || [ "$(stat -c%s "$TMP" 2>/dev/null || echo 0)" -lt 100000000 ]; then
    rm -f "$TMP"
    curl -fL --retry 3 "https://mirrors.cloud.tencent.com/gradle/gradle-$VERSION-bin.zip" -o "$TMP"
  fi
  rm -rf "$DIST.tmp"
  mkdir -p "$DIST.tmp"
  unzip -q "$TMP" -d "$DIST.tmp"
  mv "$DIST.tmp/gradle-$VERSION" "$DIST"
  rm -rf "$DIST.tmp"
fi
exec "$DIST/bin/gradle" --no-daemon "$@"
