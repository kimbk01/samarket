/**
 * @vitest-environment node
 * A 단계 (Owner 승인 2026-11-10) — 하단 탭 허브→허브·허브 뒤로가기만 슬라이드 제거, 다른 이동 연출은 유지.
 * 설계: docs/audit/app-tab-navigation-root-cause-design-2026-11-10.md §1-A
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const art = readFileSync(join(process.cwd(), "components/route-transition/AppRouteTransition.tsx"), "utf8");

function fnBody(name: string): string {
  const start = art.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = art.indexOf("\nfunction ", start + 10);
  return art.slice(start, next > 0 ? next : undefined);
}

describe("A 단계 — 허브 간 슬라이드 제거 범위", () => {
  it("하단 탭 허브 세션 경로(3곳)는 슬라이드 없이 세션을 끝낸다", () => {
    expect(art.match(/settleMainHubSwitchWithoutSlide\(el, (activeHub|active)\.generation\)/g)).toHaveLength(3);
    expect(art).not.toMatch(/applyMainHubEnter\(el, activeHub\.axis/);
    expect(art).not.toMatch(/applyMainHubEnter\(el, active\.axis/);
    const settle = fnBody("settleMainHubSwitchWithoutSlide");
    expect(settle).toContain("forceMainHubSurfaceCleanup(el)");
    expect(settle).toContain("finalizeMainHubTransition(generation)");
    expect(settle).not.toContain("classList.add(");
  });

  it("허브 뒤로가기만 즉시: 허브↔허브 + 최근 popstate 일 때만, 그 밖은 기존 fallback 슬라이드", () => {
    expect(art).toMatch(
      /if \(isKeepAliveHubRouteTransition\(prev\.pathname, pathKey\) && consumeRecentPopState\(\)\) \{\s*forceMainHubSurfaceCleanup\(el\);\s*return undefined;\s*\}\s*return beginHubFallbackEnter\(el, hubAxis, pathKey\);/
    );
    const consume = fnBody("consumeRecentPopState");
    expect(consume).toContain("lastPopStateAt = 0");
    expect(art).toContain("installHubPopStateMarker();");
  });

  it("범위 밖 연출은 그대로 — fallback 슬라이드 함수·내정보/장바구니·복구 경로 유지", () => {
    const enter = fnBody("applyMainHubEnter");
    expect(enter).toContain("el.classList.add(enterClass)");
    expect(fnBody("beginHubFallbackEnter")).toContain("applyMainHubEnter(el, axis, null)");
    expect(art).toContain("const cleanupEnter = beginHubFallbackEnter(el, pushAxis, pathKey);");
    expect(art).toContain("return beginHubFallbackEnter(el, recoverAxis, pathKey);");
    expect(art).toContain("setPushSession({");
  });
});
