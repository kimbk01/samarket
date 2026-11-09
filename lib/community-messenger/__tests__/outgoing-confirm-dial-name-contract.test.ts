import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R1 (2026-11-09) — 발신 확인창에 보인 이름 = 실제 발신 화면 이름.
 * 문서: `docs/audit/call-residual-risk-design-2026-11-09.md` §2 R1.
 */
function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("outgoing confirm dialog name = dial name", () => {
  it("방 발신 함수는 확인창 이름을 받아 방 제목보다 먼저 쓴다", () => {
    const c = src("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    expect(c).toContain('(kind: "voice" | "video", dialPeerLabel?: string | null): boolean => {');
    /** F3: 확인창 이름 → 매장 주문 구매자 매장명 → 방 제목 */
    expect(c).toContain(
      "dialPeerLabel?.trim() || resolveStoreOrderBuyerDialPeerLabel(snapshot) || snapshot?.room.title?.trim()",
    );
  });

  it("방 헤더 음성 확인창 「발신」이 확인창 이름을 넘긴다", () => {
    const h = src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
    expect(h).toContain("peerLabel={voiceConfirmPeerLabel}");
    expect(h).toContain('vm.startManagedDirectCall("voice", voiceConfirmPeerLabel)');
  });

  it("매장 주문 구매자 확인창 「발신」이 매장명을 넘긴다 (room.title 금지)", () => {
    const s = src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2StoreOrderChrome.tsx");
    expect(s).toContain("peerLabel={buyerVoicePeerLabel}");
    expect(s).toContain('vm.startManagedDirectCall("voice", buyerVoicePeerLabel)');
  });

  it("거래 채팅: 확인창·발신 모두 상대 닉네임, 대체 문구는 확인창 표시 전용", () => {
    const t = src("components/chats/TradeChatCallHeaderButtons.tsx");
    expect(t).toContain('peerLabel={dialPeerLabel || t("common_partner")}');
    expect(t).toContain("peerLabel: dialPeerLabel || undefined");
    const v = src("components/chats/ChatDetailView.tsx");
    expect(v).toContain("peerDisplayName={room.partnerDisplayName ?? null}");
    /** F2: 프로필 없을 때 ID 조각(partnerNickname 대체값)을 발신 이름으로 쓰지 않는다 */
    expect(v).not.toContain("peerDisplayName={room.partnerNickname");
  });
});
