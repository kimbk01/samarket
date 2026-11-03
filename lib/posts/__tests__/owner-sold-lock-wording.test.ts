import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OWNER_DELETE_LOCKED_COMPLETED_KO,
  isAdminModeratedTradePost,
  ownerDeleteLockedFromPost,
  ownerDeleteLockHintKey,
  ownerEditLockedFromPost,
  ownerEditLockHintKey,
} from "@/lib/posts/post-list-owner-menu";

/** 실기 2026-11-03 F1 — 판매완료 글은 숨김·삭제·수정 모두 불가: 「숨김 처리를 이용」 안내 금지 */
describe("판매자 메뉴 잠금 문구 (F1 · B-13 · D-1)", () => {
  const sold = { status: "sold", seller_listing_state: "completed" };
  const negotiating = { status: "active", seller_listing_state: "negotiating" };
  const ownerHidden = { status: "hidden", seller_listing_state: "inquiry" };
  const adminHidden = { status: "hidden", moderation_state: "admin_hidden" };

  it("판매완료 = 전용 문구 · 숨김 안내 없음", () => {
    expect(ownerDeleteLockHintKey(sold)).toBe("ui_post_owner_delete_locked_completed");
    expect(OWNER_DELETE_LOCKED_COMPLETED_KO).not.toContain("숨김");
  });

  it("협의 중 = 기존 문구 유지 · 판매중 = 잠금 없음", () => {
    expect(ownerDeleteLockHintKey(negotiating)).toBe("ui_post_owner_delete_locked_hint");
    expect(ownerDeleteLockHintKey({ status: "active" })).toBeNull();
    expect(ownerEditLockHintKey({ status: "active" })).toBeNull();
  });

  it("B-13: 판매자가 숨긴 글 = 서버처럼 수정·삭제 잠금 + 「다시 판매중」 안내", () => {
    expect(ownerEditLockedFromPost(ownerHidden)).toBe(true);
    expect(ownerDeleteLockedFromPost(ownerHidden)).toBe(true);
    expect(ownerDeleteLockHintKey(ownerHidden)).toBe("ui_post_owner_locked_hidden");
    expect(ownerEditLockHintKey(ownerHidden)).toBe("ui_post_owner_locked_hidden");
  });

  it("D-1: 관리자 숨김·삭제 글 = 수정·삭제 잠금 + 고객센터 안내", () => {
    expect(isAdminModeratedTradePost(adminHidden)).toBe(true);
    expect(isAdminModeratedTradePost({ moderation_state: "admin_deleted" })).toBe(true);
    expect(isAdminModeratedTradePost({ moderation_state: "visible" })).toBe(false);
    expect(ownerEditLockedFromPost({ status: "active", moderation_state: "admin_hidden" })).toBe(true);
    expect(ownerDeleteLockHintKey(adminHidden)).toBe("ui_post_owner_locked_admin");
  });

  it("번역·서버 거절·내 매물 ⋮ 가 같은 규칙(판정 1곳)", () => {
    const cat = readFileSync("lib/i18n/catalog/ui-phase-finish.ts", "utf8");
    expect(cat).toContain(`ui_post_owner_delete_locked_completed: "${OWNER_DELETE_LOCKED_COMPLETED_KO}"`);
    const route = readFileSync("app/api/posts/[postId]/owner-delete/route.ts", "utf8");
    expect(route).toContain('lifecycle === "completed"');
    expect(route).toContain("OWNER_DELETE_LOCKED_COMPLETED_KO");
    const actions = readFileSync("components/mypage/products/MyProductActions.tsx", "utf8");
    expect(actions).not.toContain("disabled: isSold");
    expect(actions).toContain("disabled: editLocked");
    expect(actions).toContain("disabled: deleteLocked");
    expect(actions).toContain("ownerDeleteLockHintKey(ownerMenuPost)");
    const mod = readFileSync("lib/posts/post-list-owner-menu.ts", "utf8");
    expect(mod).not.toMatch(/export function ownerDeleteLockHint\(|ownerCannotEditDeleteReason|canOwnerEditDeleteTradePostFromFeed/);
    const my = readFileSync("lib/my/load-my-posts-server.ts", "utf8");
    expect(my.match(/\.neq\("moderation_state", "admin_deleted"\)/g)?.length).toBe(2);
  });
});
