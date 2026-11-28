import { describe, expect, it } from "vitest";
import { canMoimAction, isAllowedMoimPermissionOverride, MOIM_PERMISSION_DEFAULTS } from "@/lib/moim/moim-permission-contract";
import { moimMemberSheetItems } from "@/components/moim/MoimMemberView";
import { translate } from "@/lib/i18n/messages";

/** 모임 R3 Q1·Q2 (Owner 「Q1·Q2 권장안으로 진행」 2026-11-28) — 동작 시험 */
const ko = (k: Parameters<typeof translate>[1]) => translate("ko", k);
const ctx = (viewerRole: "host" | "co_host" | "staff" | "member", overrides?: Record<string, string>) => ({
  moimStatus: "active" as const,
  platformState: "normal" as const,
  viewerRole,
  overrides: overrides as never,
});

describe("Q2 start_dm — 「운영진만 1:1」", () => {
  it("기본은 멤버 누구나", () => {
    expect(MOIM_PERMISSION_DEFAULTS.start_dm).toEqual({ defaultMinRole: "member", adjustable: true, floorRole: "member", ceilingRole: "staff" });
    expect(canMoimAction(ctx("member"), "start_dm")).toBe(true);
  });
  it("운영진 이상으로 올리면 멤버는 안 되고 운영진·모임장은 된다", () => {
    expect(canMoimAction(ctx("member", { start_dm: "staff" }), "start_dm")).toBe(false);
    expect(canMoimAction(ctx("staff", { start_dm: "staff" }), "start_dm")).toBe(true);
    expect(canMoimAction(ctx("host", { start_dm: "staff" }), "start_dm")).toBe(true);
  });
  it("상한(운영진) 위로는 저장할 수 없다 — DB moim_permissions_set 과 같은 규칙", () => {
    expect(isAllowedMoimPermissionOverride("start_dm", "staff")).toBe(true);
    expect(isAllowedMoimPermissionOverride("start_dm", "co_host")).toBe(false);
  });
  it("멤버 탭 시트: 권한이 없으면 「대화하기」 줄이 없고 「신고」만", () => {
    const off = moimMemberSheetItems({ userId: "u2" }, { t: ko, onMessage: () => {}, onReport: () => {}, canMessage: false });
    expect(off.map((i) => i.key)).toEqual(["report"]);
    const on = moimMemberSheetItems({ userId: "u2" }, { t: ko, onMessage: () => {}, onReport: () => {}, canMessage: true });
    expect(on.map((i) => i.key)).toEqual(["message", "report"]);
  });
});
