#!/usr/bin/env node
/**
 * npm install 시 이 저장소의 git hooks 경로를 .githooks 로 설정.
 * copy 방식 대신 core.hooksPath — 샌드박스·권한 이슈 없이 동일 훅 동작.
 */
import { spawnSync } from "node:child_process";

const root = process.cwd();
const gitDir = spawnSync("git", ["rev-parse", "--git-dir"], { cwd: root, encoding: "utf8" });
if (gitDir.status !== 0) {
  process.exit(0);
}

const r = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: root, encoding: "utf8" });
if (r.status !== 0) {
  console.warn("[install-git-hooks] skip: could not set core.hooksPath");
  process.exit(0);
}

console.log("[install-git-hooks] core.hooksPath=.githooks");
