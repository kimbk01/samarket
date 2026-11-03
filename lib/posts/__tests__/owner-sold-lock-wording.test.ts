import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OWNER_DELETE_LOCKED_COMPLETED_KO,
  ownerDeleteLockHint,
  ownerDeleteLockHintKey,
} from "@/lib/posts/post-list-owner-menu";

/** 실기 2026-11-03 F1 — 판매완료 글은 숨김·삭제·수정 모두 불가: 「숨김 처리를 이용」 안내 금지 */
describe("판매완료 글 잠금 문구 (F1)", () => {
  const sold = { status: "sold", seller_listing_state: "completed" };
  const negotiating = { status: "active", seller_listing_state: "negotiating" };

  it("판매완료 = 전용 문구 · 숨김 안내 없음", () => {
    expect(ownerDeleteLockHintKey(sold)).toBe("ui_post_owner_delete_locked_completed");
    expect(ownerDeleteLockHint(sold)).toBe(OWNER_DELETE_LOCKED_COMPLETED_KO);
    expect(OWNER_DELETE_LOCKED_COMPLETED_KO).not.toContain("숨김");
  });

  it("협의 중 = 기존 문구 유지 · 판매중 = 잠금 없음", () => {
    expect(ownerDeleteLockHintKey(negotiating)).toBe("ui_post_owner_delete_locked_hint");
    expect(ownerDeleteLockHintKey({ status: "active" })).toBeNull();
  });

  it("번역·서버 거절·내 매물 ⋮ 가 같은 규칙", () => {
    const cat = readFileSync("lib/i18n/catalog/ui-phase-finish.ts", "utf8");
    expect(cat).toContain(`ui_post_owner_delete_locked_completed: "${OWNER_DELETE_LOCKED_COMPLETED_KO}"`);
    const route = readFileSync("app/api/posts/[postId]/owner-delete/route.ts", "utf8");
    expect(route).toContain('lifecycle === "completed"');
    expect(route).toContain("OWNER_DELETE_LOCKED_COMPLETED_KO");
    const actions = readFileSync("components/mypage/products/MyProductActions.tsx", "utf8");
    expect(actions.match(/disabled: isSold,/g)?.length).toBe(2);
    expect(actions).toContain('notice={isSold ? t("ui_post_owner_delete_locked_completed") : undefined}');
  });
});
