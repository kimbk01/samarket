/**
 * 실기기·자동화 반복 실행 시험 상한 훅 (.claude/hooks/app-launch-guard.mjs · AGENTS.md 「실기기 반복 실행 시험 상한」).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { decide } from "../../../.claude/hooks/app-launch-guard.mjs";

let dir = "";
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "app-launch-guard-"));
});
const bash = (session: string, command: string, cwd = dir) => decide({ tool_name: "Bash", session_id: session, cwd, tool_input: { command } }, dir);
const LAUNCH = "adb -s X shell am force-stop com.dibay.app; adb -s X shell monkey -p com.dibay.app -c android.intent.category.LAUNCHER 1";

describe("앱 실행 상한", () => {
  it("일반 명령은 통과·세지 않음", () => {
    expect(bash("s", "git status").deny).toBeNull();
    expect(fs.existsSync(path.join(dir, ".claude/state/app-launch/s.count"))).toBe(false);
  });
  it("10회까지 통과, 11번째 거부", () => {
    for (let i = 0; i < 10; i += 1) expect(bash("s", LAUNCH).deny).toBeNull();
    expect(bash("s", "adb shell am start -n com.dibay.app/.MainActivity").deny).toMatch(/상한 10회/);
  });
  it("반복문 안 앱 실행 거부", () => {
    expect(bash("s", `for i in 1 2 3; do ${LAUNCH}; sleep 12; done`).deny).toMatch(/반복문/);
  });
  it("세션마다 따로 센다 · Owner 허용 파일로 추가", () => {
    for (let i = 0; i < 10; i += 1) bash("a", LAUNCH);
    expect(bash("b", LAUNCH).deny).toBeNull();
    fs.writeFileSync(path.join(dir, ".claude/state/app-launch/a.allow"), "1");
    expect(bash("a", LAUNCH).deny).toBeNull();
    expect(bash("a", LAUNCH).deny).toMatch(/상한 11회/);
  });
  it("스크립트 파일 안 앱 실행도 센다", () => {
    fs.writeFileSync(path.join(dir, "t.sh"), "adb shell monkey -p com.dibay.app 1\nadb shell monkey -p com.dibay.app 1\n");
    expect(bash("c", "bash t.sh").deny).toBeNull();
    expect(fs.readFileSync(path.join(dir, ".claude/state/app-launch/c.count"), "utf8")).toBe("2");
  });
});

describe("운영 사이트 자동화 브라우저", () => {
  it("운영 주소를 여는 Playwright 스크립트 실행 1회 = 1", () => {
    fs.writeFileSync(path.join(dir, "shot.mjs"), "import { chromium } from 'playwright';\nconst b = await chromium.launch();\nconst p = await b.newPage();\nawait p.goto('https://samarket.vercel.app/');\n");
    expect(bash("d", "node shot.mjs").deny).toBeNull();
    expect(fs.readFileSync(path.join(dir, ".claude/state/app-launch/d.count"), "utf8")).toBe("1");
  });
  it("스크립트 안에서 반복해서 여는 것은 거부", () => {
    fs.writeFileSync(path.join(dir, "loop.mjs"), "import { chromium } from 'playwright';\nfor (const w of [360, 768, 1280]) {\n  await page.goto('https://samarket.vercel.app/');\n}\n");
    expect(bash("e", "node loop.mjs").deny).toMatch(/반복문/);
  });
  it("로컬 주소 자동화는 세지 않음", () => {
    fs.writeFileSync(path.join(dir, "local.mjs"), "import { chromium } from 'playwright';\nawait page.goto('http://localhost:3000/');\n");
    expect(bash("f", "node local.mjs").deny).toBeNull();
    expect(fs.existsSync(path.join(dir, ".claude/state/app-launch/f.count"))).toBe(false);
  });
  it("브라우저 도구의 운영 사이트 이동도 센다", () => {
    for (let i = 0; i < 10; i += 1) {
      expect(decide({ tool_name: "mcp__Claude_Browser__navigate", session_id: "g", tool_input: { url: "https://samarket.vercel.app/home" } }, dir).deny).toBeNull();
    }
    expect(decide({ tool_name: "mcp__Claude_Browser__navigate", session_id: "g", tool_input: { url: "https://samarket.vercel.app/" } }, dir).deny).toMatch(/상한/);
    expect(decide({ tool_name: "mcp__Claude_Browser__navigate", session_id: "g", tool_input: { url: "http://localhost:3000/" } }, dir).deny).toBeNull();
  });
});
