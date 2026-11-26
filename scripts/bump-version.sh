#!/usr/bin/env bash
# ==============================================================================
# 听序（Tingxu）— 版本号统一同步脚本
# 用途：按语义化版本规则同步更新以下 3 处版本号，不自动打 Git Tag 或触发发版：
#   1. package.json
#   2. src-tauri/tauri.conf.json
#   3. src-tauri/Cargo.toml ([package] version)
#
# 用法：
#   bash scripts/bump-version.sh patch [--dry-run]
#   bash scripts/bump-version.sh minor [--dry-run]
#   bash scripts/bump-version.sh major [--dry-run]
#   bash scripts/bump-version.sh 0.4.1 [--dry-run]
# ==============================================================================

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "用法: bash scripts/bump-version.sh <patch|minor|major|X.Y.Z> [--dry-run]" >&2
  exit 1
fi

BUMP_ARG="$1"
DRY_RUN="false"
if [ "${2:-}" = "--dry-run" ]; then
  DRY_RUN="true"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_JSON="$ROOT_DIR/package.json"
TAURI_CONF="$ROOT_DIR/src-tauri/tauri.conf.json"
CARGO_TOML="$ROOT_DIR/src-tauri/Cargo.toml"

node -e '
const fs = require("fs");

const [bumpArg, dryRunFlag, pkgPath, tauriPath, cargoPath] = process.argv.slice(1);
const dryRun = dryRunFlag === "true";

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const current = String(pkg.version || "").trim();
const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) {
  console.error(`无法解析当前版本号: ${current}`);
  process.exit(1);
}

let [major, minor, patch] = match.slice(1).map(Number);
let nextVersion = "";

if (bumpArg === "patch") {
  nextVersion = `${major}.${minor}.${patch + 1}`;
} else if (bumpArg === "minor") {
  nextVersion = `${major}.${minor + 1}.0`;
} else if (bumpArg === "major") {
  nextVersion = `${major + 1}.0.0`;
} else if (/^\d+\.\d+\.\d+$/.test(bumpArg)) {
  nextVersion = bumpArg;
} else {
  console.error(`不支持的版本参数: ${bumpArg}（仅支持 patch / minor / major / X.Y.Z）`);
  process.exit(1);
}

const pkgRaw = fs.readFileSync(pkgPath, "utf8");
const tauriRaw = fs.readFileSync(tauriPath, "utf8");
const cargoRaw = fs.readFileSync(cargoPath, "utf8");

const nextPkgRaw = pkgRaw.replace(
  /("version"\s*:\s*")\d+\.\d+\.\d+(")/,
  `$1${nextVersion}$2`
);
const nextTauriRaw = tauriRaw.replace(
  /("version"\s*:\s*")\d+\.\d+\.\d+(")/,
  `$1${nextVersion}$2`
);
const nextCargoRaw = cargoRaw.replace(
  /(\[package\][\s\S]*?^version\s*=\s*")\d+\.\d+\.\d+(")/m,
  `$1${nextVersion}$2`
);

if (nextPkgRaw === pkgRaw && current !== nextVersion) {
  console.error("未能更新 package.json 版本号");
  process.exit(1);
}
if (nextTauriRaw === tauriRaw && current !== nextVersion) {
  console.error("未能更新 src-tauri/tauri.conf.json 版本号");
  process.exit(1);
}
if (nextCargoRaw === cargoRaw && current !== nextVersion) {
  console.error("未能更新 src-tauri/Cargo.toml 版本号");
  process.exit(1);
}

console.log(`版本号变更: ${current} -> ${nextVersion}${dryRun ? " (dry-run)" : ""}`);
if (!dryRun) {
  fs.writeFileSync(pkgPath, nextPkgRaw, "utf8");
  fs.writeFileSync(tauriPath, nextTauriRaw, "utf8");
  fs.writeFileSync(cargoPath, nextCargoRaw, "utf8");
  console.log("已同步更新:");
  console.log("  - package.json");
  console.log("  - src-tauri/tauri.conf.json");
  console.log("  - src-tauri/Cargo.toml");
  console.log("提示：本次仅更新版本号，未自动创建 Git Tag 或触发发版。");
}
' "$BUMP_ARG" "$DRY_RUN" "$PKG_JSON" "$TAURI_CONF" "$CARGO_TOML"
