import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 1단계 문서 §13-6 통화 탭 행 U-8·U-9 (2026-10-25 Owner 승인 · 통화 단독 커밋) — 표시만, 발신 경로 무변경 잠금. */
function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("call tab row U-8·U-9", () => {
  it("U-9 「친구 아님」은 홈 현재 친구 목록 기준, 홈 밖에서만 서버 값", () => {
    const row = src("components/community-messenger/call-history/CommunityMessengerCallRow.tsx");
    expect(row).toContain("useMessengerFriendActions()");
    expect(row).toContain("!friendActions.friendIds.has(call.peerUserId)");
    /** §15: 글자 대신 사진 배지·행 띠, 내가 차단한 상대만 금지 배지(상대 차단은 노출 안 함) */
    expect(row).toContain(": showNotFriend");
    expect(row).toContain("<MessengerPeerRelationAvatar mark={relationMark}>");
    expect(row).toContain("peekBootstrapCache()?.blocked");
    expect(row).not.toContain('call.peerRelationLabel === "blocked"');
  });

  it("U-8 이름 (@아이디) 띄어쓰기 · 토큰 색 · 테두리형 재다이얼 — 발신 확인 경로 유지", () => {
    const row = src("components/community-messenger/call-history/CommunityMessengerCallRow.tsx");
    expect(row).toContain("> (@{vm.peerPublicId})</span>");
    expect(row).toContain("onPress={() => onRequestOutgoingConfirm(call, vm.callKind)}");
    const btn = src("components/community-messenger/call-history/CommunityMessengerCallActionButton.tsx");
    expect(btn).not.toContain("#00754A");
    expect(btn).toContain("onPress();");
    const badge = src("components/community-messenger/call-history/CommunityMessengerCallDirectionBadge.tsx");
    expect(badge).not.toContain("#E53935");
    expect(badge).toContain("var(--sam-danger)");
  });
});
