import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * D-6 §6 (docs/audit/messenger-2026-10-26-d6-list-archive-root-cause.md · 실측 10-26 17:40):
 * 앱 복귀 정합이 받은 서버 목록을 비교만 하고 버려, 백그라운드 동안 놓친 보관 해제가 복귀 뒤에도 반영되지 않았다.
 */
const probe = readFileSync("lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts", "utf8");
const boot = readFileSync("lib/community-messenger/home/use-community-messenger-home-bootstrap.ts", "utf8");
const home = readFileSync("components/community-messenger/CommunityMessengerHome.tsx", "utf8");

describe("D-6 앱 복귀 정합 = 서버 목록을 화면 상태에 적용", () => {
  it("복귀 정합(runHomeCatchupGapProbe)이 받은 서버 목록을 적용 함수로 넘긴다", () => {
    const start = probe.indexOf("const runHomeCatchupGapProbe = useCallback(");
    const block = probe.slice(start, probe.indexOf("const scheduleVisibilityResumeGapProbe", start));
    expect(block).toContain("reconcileHomeListFromServerRef.current?.({ chats: json.chats, groups: json.groups });");
    expect(probe).toContain("reconcileHomeListFromServerRef.current = reconcileHomeListFromServer;");
  });

  it("적용은 화면 상태 기준 critical_patch 이고 캐시 비교 건너뛰기를 거치지 않는다", () => {
    expect(boot).toContain('applyHomeSyncPayload(payload, "critical_patch", { serverReconcile: true });');
    expect(boot).toContain(
      "if (!forceApply && !opts?.serverReconcile && shouldSkipHomeSyncPayload(skipPayload, { reactBase: prev })) {"
    );
  });

  it("홈 화면이 적용 함수를 복귀 정합 훅에 연결한다", () => {
    expect(home).toMatch(/useCommunityMessengerHomeRealtimeBootstrapList\(\{[\s\S]*?reconcileHomeListFromServer,\n {2}\}\);/);
  });
});
