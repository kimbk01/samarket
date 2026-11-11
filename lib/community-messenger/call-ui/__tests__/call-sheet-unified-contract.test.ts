import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 발신 창 통일 3판 (Owner 승인 2026-11-12) — 앱의 1:1 발신 전 창은 통화 시트 하나.
 * 시안: docs/audit/call-choice-sheet-mockup-v3-2026-11-12.html
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const SHEET_IMPORT = 'import("@/components/community-messenger/call-ui/MessengerCallChoiceSheet")';

/** 1:1 발신 진입점 9곳이 있는 파일 */
const ENTRY_FILES = [
  "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx",
  "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx",
  "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal.tsx",
  "components/community-messenger/MessengerCallLogsPanel.tsx",
  "components/community-messenger/CommunityMessengerHome.tsx",
  "components/community-messenger/CommunityMessengerCallClient.tsx",
];

describe("발신 창 통일 — 통화 시트 1종", () => {
  it("1:1 진입점은 통화 시트를 지연 import 로만 쓴다 (연락처 코드를 첫 화면에 넣지 않음)", () => {
    for (const file of ENTRY_FILES) {
      const src = read(file);
      expect(src, file).toContain(SHEET_IMPORT);
      expect(src, file).not.toMatch(/^import [^;]*call-ui\/MessengerCallChoiceSheet/m);
    }
  });

  it("1:1 진입점에서 가운데 확인 팝업을 쓰지 않는다 (그룹 통화 보류 분기만 예외)", () => {
    for (const file of ENTRY_FILES) {
      const src = read(file);
      if (file.endsWith("MessageTimeline.tsx")) {
        /** 그룹방 말풍선(그룹 통화 보류 해제 시) 확인 팝업은 그룹 통화 전용 */
        const block = src.slice(src.indexOf("{stubRedialConfirmKind ? ("), src.indexOf("{stubCallSheetOpen ? ("));
        expect(block).toContain("vm.startGroupCall(kind)");
        expect(block).not.toContain("startManagedDirectCall");
        continue;
      }
      expect(src, file).not.toContain("MessengerOutgoingCallConfirmDialog");
    }
  });

  it("연락처 회원 시트 「매번 묻기」도 같은 통화 시트 · 옛 연락처 목록형 시트 부품 없음", () => {
    const member = read("components/community-messenger/contacts/MessengerContactsMemberSheet.tsx");
    expect(member).toContain('from "@/components/community-messenger/call-ui/MessengerCallChoiceSheet"');
    const contacts = read("components/community-messenger/contacts/MessengerContactsCallChoiceSheet.tsx");
    expect(contacts).not.toContain("export function MessengerContactsCallChoiceSheet");
  });

  it("통화 진입 버튼은 「통화」 하나 — 음성·영상 따로 없음", () => {
    const profile = read("components/community-messenger/MessengerFriendProfileSheet.tsx");
    expect(profile).toContain('key: "call"');
    expect(profile).not.toContain('key: "video"');
    const quick = read("components/community-messenger/MessengerFriendRowQuickPopup.tsx");
    expect(quick).toContain('key: "call"');
    expect(quick).not.toContain('key: "video"');
    const detail = read("components/community-messenger/call-history/CommunityMessengerCallPeerDetailPanel.tsx");
    expect(detail).not.toContain("cm_ui_call_peer_detail_video");
    const member = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal.tsx");
    expect(member).not.toContain("setOutCallKind");
  });

  it("통화 시트 = 앱 공용 시트·버튼 (DibayBottomSheet · DibayOverlayButton primary/secondary/text)", () => {
    const sheet = read("components/community-messenger/call-ui/MessengerCallChoiceSheet.tsx");
    expect(sheet).toContain("<DibayBottomSheet");
    expect(sheet).toContain('roleTone="primary"');
    expect(sheet).toContain('roleTone="secondary"');
    expect(sheet).toContain('roleTone="text"');
    expect(sheet).toContain('t("nav_voice_call_label")');
    expect(sheet).toContain('t("nav_video_call_label")');
    expect(sheet).toContain('t("cm_contacts_call_phone")');
    expect(sheet).not.toContain("cm_contacts_call_dibay_sub");
  });

  it("말풍선·통화 탭에서 연 직후 합성 click 으로 닫히지 않는다 — 여는 시각은 렌더 때 (PR #161 Bugbot)", () => {
    const sheet = read("components/community-messenger/call-ui/MessengerCallChoiceSheet.tsx");
    expect(sheet).toContain("const [openedAt] = useState(() => Date.now());");
    expect(sheet).toContain("if (Date.now() - openedAt < BACKDROP_DISMISS_GUARD_MS) return;");
    expect(sheet).not.toContain("openedAtRef");
  });

  it("발신을 먼저 알리고 닫는다 · 연락처 회원은 발신 실패 시 통화 시트 다시 (PR #161 Bugbot)", () => {
    const sheet = read("components/community-messenger/call-ui/MessengerCallChoiceSheet.tsx");
    expect(sheet).toMatch(/onDibayCall\(kind\);\s*onClose\(\);/);
    const member = read("components/community-messenger/contacts/MessengerContactsMemberSheet.tsx");
    expect(member).toContain("if (!dialingRef.current) onClose();");
    expect(member).toMatch(/if \(ok\) onClose\(\);\s*else setChoiceOpen\(true\);/);
  });

  it("쓰지 않던 옛 통화 부품 삭제", () => {
    expect(existsSync(join(process.cwd(), "components/chats/TradeChatCallHeaderButtons.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "components/community-messenger/call-ui/CallKindBottomSheetActions.tsx"))).toBe(false);
  });
});
