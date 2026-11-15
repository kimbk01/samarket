/**
 * 스티커 늘리기 (Owner 2026-11-16 「OpenMoji 로 진행」) — 11개 → OpenMoji 7묶음 추가.
 * 운영 DB 에 스티커 표가 없어 코드 목록이 실제 목록이다(2026-11-16 운영 DB 조회).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_STICKER_ITEMS, FALLBACK_STICKER_PACKS } from "@/lib/stickers/fallback-sticker-catalog";
import { normalizeCommunityMessengerStickerContent } from "@/lib/stickers/sticker-content";

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => {
    throw new Error("DB 를 부르면 안 됨");
  },
}));

const OM = FALLBACK_STICKER_PACKS.filter((p) => p.slug.startsWith("om-"));

describe("OpenMoji 스티커 묶음", () => {
  it("묶음 7개 추가 · 기존 기본·리액션 그대로 앞에", () => {
    expect(FALLBACK_STICKER_PACKS.slice(0, 2).map((p) => p.slug)).toEqual(["basic", "reaction"]);
    expect(OM.map((p) => p.slug)).toEqual([
      "om-faces",
      "om-hearts",
      "om-hands",
      "om-animals",
      "om-food",
      "om-activities",
      "om-originals",
    ]);
  });

  it("스티커 500개 이상 · 모든 그림 파일이 있고 · 보내기 검사를 통과", () => {
    const items = FALLBACK_STICKER_ITEMS.filter((i) => i.packId.startsWith("fallback-om-"));
    expect(items.length).toBeGreaterThan(500);
    for (const it of items) {
      expect(existsSync(path.join(process.cwd(), "public", it.fileUrl))).toBe(true);
      expect(normalizeCommunityMessengerStickerContent(it.fileUrl)).toBe(it.fileUrl);
    }
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("모든 묶음에 출처 표시 키(CC BY · CC BY-SA)와 이름 키가 있다", () => {
    for (const p of FALLBACK_STICKER_PACKS) expect(p.creditKey).toMatch(/^cm_ui_sticker_credit_/);
    for (const p of OM) {
      expect(p.creditKey).toBe("cm_ui_sticker_credit_openmoji");
      expect(p.nameKey).toMatch(/^cm_ui_sticker_pack_/);
    }
  });

  it("실존 인물·음주 묘사는 넣지 않는다", () => {
    const kw = FALLBACK_STICKER_ITEMS.map((i) => i.keyword.toLowerCase());
    for (const banned of ["trump", "greta thunberg", "drunk person"]) expect(kw).not.toContain(banned);
  });

  it("묶음 항목 조회는 DB 를 부르지 않고 코드 목록에서 돌려준다", async () => {
    const { listStickerItemsForPack } = await import("@/lib/stickers/sticker-catalog-db");
    const rows = await listStickerItemsForPack("fallback-om-hearts");
    expect(rows.length).toBe(FALLBACK_STICKER_ITEMS.filter((i) => i.packId === "fallback-om-hearts").length);
    expect(rows.length).toBeGreaterThan(10);
  });

  it("스티커 시트는 묶음 이름 키와 출처 줄을 그린다", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/community-messenger/stickers/MessengerStickerSheet.tsx"),
      "utf8"
    );
    expect(src).toContain("data-cm-sticker-credit");
    expect(src).toContain("p.nameKey ? t(p.nameKey as MessageKey) : p.name");
  });
});
