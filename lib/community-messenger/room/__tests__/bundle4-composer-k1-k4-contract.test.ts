import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("§2 bundle4 composer contracts", () => {
  it("K-1 Phase2Composer uses Enter policy helper (not unconditional send)", () => {
    const src = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx");
    expect(src).toContain("shouldSendOnEnterKey");
    expect(src).toContain("resolvePreferNewlineOnEnter");
    expect(src).toContain("isCapacitorNativePlatform");
    expect(src).toContain("readCoarsePointerFromWindow");
    expect(src).not.toMatch(/if \(e\.key !== "Enter" && e\.key !== "NumpadEnter"\) return;\s*if \(e\.shiftKey\) return;\s*if \(e\.nativeEvent\.isComposing\) return;\s*e\.preventDefault\(\);\s*commitTextSend\(\)/);
  });

  it("K-2 sector grows with max height (not fixed 44px box)", () => {
    const tuning = read("lib/ui/messenger-chat-viewport-tuning.ts");
    expect(tuning).toContain("MESSENGER_DELIVERY_COMPOSER_TEXTAREA_MAX_HEIGHT_PX");
    expect(tuning).toContain('min-h-[44px] max-h-[120px]');
    expect(tuning).not.toContain('h-[44px] min-h-[44px] max-h-[44px]');
    expect(tuning).toContain("MESSENGER_DELIVERY_COMPOSER_ROW_ALIGN_SINGLE_CLASS");
    expect(tuning).toContain("messengerComposerDraftIsMultiLine");
    const sector = read("components/community-messenger/line-ui/messenger-composer-sector.tsx");
    expect(sector).toContain("MESSENGER_DELIVERY_COMPOSER_TEXTAREA_MAX_HEIGHT_PX");
    expect(sector).toContain("useLayoutEffect");
    expect(sector).toContain("MESSENGER_DELIVERY_COMPOSER_ROW_ALIGN_SINGLE_CLASS");
    expect(sector).not.toContain("max-h-[36px]");
    const deliveryCss = read("app/delivery-chat-room.css");
    expect(deliveryCss).toContain("max-height: 100px !important;");
    expect(deliveryCss).not.toContain("max-height: 36px !important;");
    expect(deliveryCss).not.toContain("height: auto !important;");
    const shellCss = read("app/chat-viewport-shell.css");
    expect(shellCss).toMatch(/\.chat-composer\s*\{[^}]*justify-content:\s*center/);
  });

  it("K-3 edit path does not clear composer before PATCH; returns boolean", () => {
    const src = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    const editStart = src.indexOf("const editRoomMessageText = useCallback");
    const editBody = src.slice(editStart, src.indexOf("const startEditMessage = useCallback", editStart));
    expect(editBody).toContain("Promise<boolean>");
    expect(editBody).toContain("return false");
    expect(editBody).toContain("return true");
    const sendStart = src.indexOf("const sendMessage = useCallback");
    const sendBody = src.slice(sendStart, src.indexOf("const insertComposerEmoji = useCallback", sendStart));
    expect(sendBody).toContain("const ok = await editRoomMessageText(editTarget.id, raw)");
    expect(sendBody).toContain("return ok");
    expect(sendBody).not.toMatch(/if \(editTarget\?\.id\) \{\s*setMessage\(""\)/);
  });

  it("이모지 고르기 = 입력창 삽입, 바로 전송 없음 (K-4 · 2026-11-16 측정 정정)", () => {
    const sheets = read(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx"
    );
    expect(sheets).toContain("vm.insertComposerEmoji(emoji)");
    expect(sheets).not.toContain("void vm.sendMessage(emoji)");
    const ctrl = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    const start = ctrl.indexOf("const insertComposerEmoji = useCallback");
    const body = ctrl.slice(start, ctrl.indexOf("const sendSticker = useCallback", start));
    expect(body).toContain("insertEmojiIntoComposerText");
    expect(body).not.toMatch(/sendMessage\(/);
    expect(ctrl).not.toContain("insertOrSendComposerEmoji");
  });
});
