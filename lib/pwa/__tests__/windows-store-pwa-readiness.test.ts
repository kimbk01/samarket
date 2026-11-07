import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { buildDibayWebAppManifest } from "@/lib/pwa/dibay-web-app-manifest";
import { proxy } from "@/proxy";

/**
 * Microsoft Store(PWABuilder) 제출 전 고정 조건.
 * docs/audit/windows-msstore-launch-audit-2026-11-07.md C-1·C-2
 */
describe("Windows Store PWA readiness", () => {
  it("C-1 manifest id 는 '/' 로 고정되고 start_url·scope 와 같다", () => {
    const m = buildDibayWebAppManifest();
    expect(m.id).toBe("/");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.icons?.some((i) => i.sizes === "512x512")).toBe(true);
  });

  it("C-2 비로그인(쿠키 없음) /sw.js 는 로그인으로 리디렉트되지 않는다", async () => {
    const res = await proxy(new NextRequest("http://localhost/sw.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("C-2 범위 고정: 다른 .js 경로는 공개 목록에 추가되지 않았다", () => {
    // 공개 정적 확장자 정규식에 js 가 없어야 한다 (sw.js 만 정확히 허용).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require("node:fs").readFileSync(require("node:path").resolve(process.cwd(), "proxy.ts"), "utf8") as string;
    expect(src).toContain('pathname === "/sw.js"');
    expect(src).not.toMatch(/\|js\|/);
  });
});

describe("typecheck:test 격리", () => {
  it("매니페스트 값 모듈은 next 를 import 하지 않는다 (next 전역 타입이 테스트 타입검사로 새지 않게)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require("node:fs").readFileSync(require("node:path").resolve(process.cwd(), "lib/pwa/dibay-web-app-manifest.ts"), "utf8") as string;
    expect(src).not.toMatch(/from\s+["']next["']/);
  });
});
