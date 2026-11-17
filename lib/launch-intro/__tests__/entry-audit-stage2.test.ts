/**
 * 진입 감사 2단계 (2026-11-17) — IN-4 재생 시간 상한 · IN-5 화면 가득 그림 해상도 · IN-7 삭제 게시본 · PO-1 「광고」 표기 기준.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LAUNCH_INTRO_TOTAL_MAX_MS,
  clampLaunchIntroDocumentDuration,
  launchIntroLowResFullscreenSceneIds,
  launchIntroTotalDurationMs,
} from "@/lib/launch-intro/document";
import { loadDeletedLaunchIntroPublicationIds, type Sb } from "@/lib/launch-intro/server";

const img = (w: number, h: number) => ({ asset: { width: w, height: h } });

describe("IN-4 재생 직전 5초 상한", () => {
  it("운영 게시본(3+3+4=10초)은 3+2초로 잘린다", () => {
    const doc = { scenes: [{ durationMs: 3000 }, { durationMs: 3000 }, { durationMs: 4000 }] };
    const out = clampLaunchIntroDocumentDuration(doc);
    expect(out.scenes.map((s) => s.durationMs)).toEqual([3000, 2000]);
    expect(launchIntroTotalDurationMs(out)).toBe(LAUNCH_INTRO_TOTAL_MAX_MS);
  });
  it("남은 시간이 1초 미만이면 그 장면은 넣지 않는다 · 5초 이하는 그대로", () => {
    expect(
      clampLaunchIntroDocumentDuration({ scenes: [{ durationMs: 4500 }, { durationMs: 2000 }] }).scenes.map((s) => s.durationMs)
    ).toEqual([4500]);
    const ok = { scenes: [{ durationMs: 2000 }, { durationMs: 3000 }] };
    expect(clampLaunchIntroDocumentDuration(ok)).toBe(ok);
  });
  it("첫 장면 하나가 5초보다 길면 5초로", () => {
    expect(clampLaunchIntroDocumentDuration({ scenes: [{ durationMs: 8000 }] }).scenes[0].durationMs).toBe(5000);
  });
});

describe("IN-5 화면 가득 그림 해상도", () => {
  it("360×640 배경은 거절, 1080 이상은 통과, fullbleed 메인 그림도 검사, stack 메인 그림은 검사 안 함", () => {
    const ids = launchIntroLowResFullscreenSceneIds({
      scenes: [
        { id: "a", layout: "logo", background: { media: img(360, 640) }, media: null },
        { id: "b", layout: "fullbleed", background: { media: null }, media: img(900, 1600) },
        { id: "c", layout: "fullbleed", background: { media: null }, media: img(600, 900) },
        { id: "d", layout: "stack", background: { media: null }, media: img(512, 512) },
      ],
    });
    expect(ids).toEqual(["a", "c"]);
  });
});

describe("IN-7 삭제한 게시본", () => {
  it("최신 기록이 ad.delete 인 id 만 삭제로 본다 (복구 ad.undelete 가 더 최신이면 삭제 아님)", async () => {
    const rows = [
      { target_id: "p1", action: "ad.delete" },
      { target_id: "p2", action: "ad.undelete" },
      { target_id: "p2", action: "ad.delete" },
    ];
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      then: (resolve: (v: { data: typeof rows; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    const sb = { from: () => chain } as unknown as Sb;
    const r = await loadDeletedLaunchIntroPublicationIds(sb, ["p1", "p2", "p3"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect([...r.ids]).toEqual(["p1"]);
  });
  it("목록·다시 게시·재개·같은 초안 재게시가 삭제 표시를 본다", () => {
    const src = readFileSync("lib/launch-intro/server.ts", "utf8");
    expect(src.match(/loadDeletedLaunchIntroPublicationIds\(sb,/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).toContain('error: "publication_deleted"');
    expect(src).toContain('error: "cta_event_unavailable"');
  });
});

describe("PO-1 「광고」 표기 기준 상자", () => {
  it("소재 버튼 공통 클래스가 position: relative", () => {
    const css = readFileSync("app/platform-popup.css", "utf8");
    expect(css).toMatch(/\.dibay-promo-creative \{\s*position: relative;\s*\}/);
  });
});
