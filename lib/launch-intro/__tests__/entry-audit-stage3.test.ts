/**
 * 진입 감사 3단계 (2026-11-17) — IN-6 기기 인트로 이미지 보관 기간 · PO-9 팝업 소재 파일 정리.
 * 실측: 게시 중단 뒤 기기에 이미지 9개 1.09MB 무기한 유지 · 운영 팝업 소재 78개 중 10개 고아 파일.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  LAUNCH_INTRO_INACTIVE_RETENTION_MS,
  expireInactiveLaunchIntroIndex,
  type LaunchIntroIndex,
} from "@/lib/launch-intro/cache";
import { removeUnreferencedPopupCreativeFiles } from "@/lib/platform-popup/creative-storage-cleanup";

const pub = { id: "p1", document: { schemaVersion: 2, scenes: [], settings: { skip: { enabled: true } } }, assets: [], eligibility: { frequency: "every_launch" } };
function index(over: Partial<LaunchIntroIndex>): LaunchIntroIndex {
  return { schema: 1, revision: 1, state: "unpublished", publication: pub as never, promotedAt: "2026-11-01T00:00:00.000Z", ...over };
}

describe("IN-6 비활성 인트로 보관 기간", () => {
  const t0 = Date.parse("2026-11-10T00:00:00.000Z");
  it("보관 기간 안이면 그대로, 지나면 게시본을 뺀다", () => {
    const idx = index({ inactiveSince: new Date(t0).toISOString() });
    expect(expireInactiveLaunchIntroIndex(idx, t0 + LAUNCH_INTRO_INACTIVE_RETENTION_MS - 1)).toBeNull();
    const out = expireInactiveLaunchIntroIndex(idx, t0 + LAUNCH_INTRO_INACTIVE_RETENTION_MS);
    expect(out?.publication).toBeNull();
    expect(out?.state).toBe("unpublished");
  });
  it("active · 게시본 없음 · 시각 없음(옛 색인)은 지우지 않는다", () => {
    expect(expireInactiveLaunchIntroIndex(index({ state: "active", inactiveSince: "2020-01-01T00:00:00.000Z" }), t0)).toBeNull();
    expect(expireInactiveLaunchIntroIndex(index({ publication: null, inactiveSince: "2020-01-01T00:00:00.000Z" }), t0)).toBeNull();
    expect(expireInactiveLaunchIntroIndex(index({}), t0)).toBeNull();
  });
  it("discovery: 변화 없을 때도 만료 검사 · 비활성 시각은 처음 한 번만 · 받다 만 파일 정리", () => {
    const src = readFileSync("lib/launch-intro/discovery.ts", "utf8");
    expect(src.match(/expireInactiveLaunchIntroIndex\(/g)?.length).toBe(2);
    expect(src).toContain('current?.state !== "active" && current?.inactiveSince');
    expect(src).toMatch(/if \(!ok\) \{[\s\S]*collectLaunchIntroAssetGarbage\(keep\)/);
  });
});

describe("PO-9 팝업 소재 파일 정리", () => {
  function fakeSb(refs: { creatives: string[]; requests: string[]; failCheck?: boolean }) {
    const remove = vi.fn(async () => ({ error: null }));
    const sb = {
      from: (table: string) => ({
        select: () => ({
          in: async () => {
            if (refs.failCheck) return { data: null, error: { message: "boom" } };
            return table === "platform_popup_creatives"
              ? { data: refs.creatives.map((p) => ({ asset_path: p })), error: null }
              : { data: refs.requests.map((p) => ({ creative_asset_path: p })), error: null };
          },
        }),
      }),
      storage: { from: () => ({ remove }) },
    };
    return { sb: sb as never, remove };
  }

  it("어떤 행도 참조하지 않는 경로만 지운다", async () => {
    const { sb, remove } = fakeSb({ creatives: ["a"], requests: ["b"] });
    const r = await removeUnreferencedPopupCreativeFiles(sb, ["a", "b", "c", "c", null], "test");
    expect(r.removed).toEqual(["c"]);
    expect(remove).toHaveBeenCalledWith(["c"]);
  });
  it("참조 확인이 실패하면 아무것도 지우지 않는다", async () => {
    const { sb, remove } = fakeSb({ creatives: [], requests: [], failCheck: true });
    expect((await removeUnreferencedPopupCreativeFiles(sb, ["x"], "test")).removed).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });
  it("업로드 연결 실패·초안 삭제·사장님 소재 교체 3곳이 정리를 부른다", () => {
    expect(readFileSync("app/api/admin/platform-popup-campaigns/[campaignId]/creative/route.ts", "utf8")).toContain(
      '"admin_replace_failed"'
    );
    expect(readFileSync("lib/platform-popup/admin-campaign-delete-draft.ts", "utf8")).toContain('"delete_draft"');
    const owner = readFileSync("app/api/me/platform-popup-requests/[requestId]/creative/route.ts", "utf8");
    expect(owner).toContain('"owner_request_update_failed"');
    expect(owner).toContain('"owner_request_replaced"');
  });
});
