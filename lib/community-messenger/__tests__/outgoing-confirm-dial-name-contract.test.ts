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

  /** 통화 버튼 통합 2판 (Owner 2026-11-12): 방 안 발신은 헤더 📞 선택 시트 하나 — 시트 제목 이름 = 발신 이름 */
  it("방 헤더 통화 선택 시트: 시트에 보인 이름을 그대로 발신에 넘긴다", () => {
    const h = src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
    expect(h).toContain("peerLabel={voiceConfirmPeerLabel}");
    expect(h).toContain("vm.startManagedDirectCall(kind, voiceConfirmPeerLabel)");
    const sheet = src("components/community-messenger/call-ui/MessengerCallChoiceSheet.tsx");
    /** 발신 창 통일 3판: 시트 제목 = 받는 사람 이름 (대체 문구는 표시 전용) */
    expect(sheet).toContain('const title = peerLabel.trim() || t("common_partner");');
    expect(sheet).toContain("{title}</h2>");
  });

  it("매장 주문 구매자: 헤더 발신 이름은 매장명 (room.title 금지) · 주문 진행 시트 📞 없음", () => {
    const h = src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
    expect(h).toMatch(/if \(isDeliveryBuyer\) \{\s*const storeLabel = resolveStoreOrderBuyerDialPeerLabel\(vm\.snapshot\);/);
    const s = src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2StoreOrderChrome.tsx");
    expect(s).not.toContain("startManagedDirectCall");
    const drawer = src("components/community-messenger/room/phase2/StoreOrderBuyerRoomSheet.tsx");
    expect(drawer).not.toContain("onVoiceCall");
  });

  /** 발신 창 통일 3판: 옛 거래 화면 통화 버튼(도달 불가)은 삭제 — 거래방 발신은 메신저 방 헤더 통화 시트 하나 */
  it("거래 채팅: 옛 거래 화면 통화 버튼 없음", () => {
    const v = src("components/chats/ChatDetailView.tsx");
    expect(v).not.toContain("TradeChatCallHeaderButtons");
  });
});
