import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCrewRepChartPoints } from "@/lib/trust/crew-rep-chart-points";

const NOW = new Date("2026-11-16T02:00:00.000Z").getTime();
const D = 86_400_000;
const at = (daysAgo: number) => new Date(NOW - daysAgo * D).toISOString();

describe("F3 — CREW REP 90일 그래프 시작점 (실기 2026-11-16)", () => {
  it("85 → 55 이력 1건: 85 에서 시작해 그 시점에 55, 끝 55", () => {
    const pts = buildCrewRepChartPoints([{ at: at(0.1), before: 85.29, after: 55.21, cause: "policy_migration" }], 55.21, NOW);
    expect(pts.map((p) => p.v)).toEqual([85.29, 55.21, 55.21]);
    expect(pts[0]!.t).toBe(NOW - 90 * D);
    expect(pts[2]!.t).toBe(NOW);
  });

  it("기간 전 점수(carry)가 있으면 그것이 시작점", () => {
    const pts = buildCrewRepChartPoints(
      [
        { at: at(90), before: null, after: 60, cause: "carry" },
        { at: at(30), before: 60, after: 58, cause: "daily_recompute" },
      ],
      58,
      NOW
    );
    expect(pts.map((p) => p.v)).toEqual([60, 58, 58]);
  });

  it("이력 없음: 현재 점수로 평평", () => {
    expect(buildCrewRepChartPoints([], 50, NOW).map((p) => p.v)).toEqual([50, 50]);
  });

  it("처음 생긴 점수(before 없음)는 그 점수로 시작", () => {
    expect(
      buildCrewRepChartPoints([{ at: at(5), before: null, after: 52, cause: "event" }], 52, NOW).map((p) => p.v)
    ).toEqual([52, 52, 52]);
  });

  it("기간 밖·미래 이력은 점으로 쓰지 않고 시간순 정렬", () => {
    const pts = buildCrewRepChartPoints(
      [
        { at: at(10), before: 57, after: 55, cause: "event" },
        { at: at(200), before: 70, after: 60, cause: "event" },
        { at: at(40), before: 60, after: 57, cause: "event" },
        { at: at(-1), before: 55, after: 99, cause: "event" },
      ],
      55,
      NOW
    );
    expect(pts.map((p) => p.v)).toEqual([60, 57, 55, 55]);
  });
});

describe("F2 — ⋮ 메뉴: 방 데이터에 점수가 없으면 공개 요약으로 표시 (구조 계약)", () => {
  const root = path.resolve(__dirname, "../../..");
  const menu = readFileSync(path.join(root, "components/community-messenger/room/phase2/ChatRoomMoreMenu.tsx"), "utf8");
  it("점수 없을 때만 1회 읽고, 매장 프로필(menuProfile)은 읽지 않는다", () => {
    expect(menu).toMatch(/useCrewRepPublicSummary\(peerMemberId, snapshotCrewRepScore == null\)/);
    expect(menu).toMatch(/const peerMemberId = !menuProfile && otherUser\.id/);
    expect(menu).toMatch(/initialSummary=\{fetchedCrewRep\}/);
  });
  it("가짜 기본 점수(50·36.5°C)로 채우지 않는다", () => {
    expect(menu).not.toMatch(/°C/);
    expect(menu).toMatch(/snapshotCrewRepScore \?\? fetchedCrewRep\?\.score \?\? null/);
  });
});
