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
    const sector = read("components/community-messenger/line-ui/messenger-composer-sector.tsx");
    expect(sector).toContain("MESSENGER_DELIVERY_COMPOSER_TEXTAREA_MAX_HEIGHT_PX");
    expect(sector).toContain("useLayoutEffect");
    expect(sector).not.toContain("max-h-[36px]");
  });

  it("K-3 edit path does not clear composer before PATCH; returns boolean", () => {
    const src = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    const editStart = src.indexOf("const editRoomMessageText = useCallback");
    const editBody = src.slice(editStart, src.indexOf("const startEditMessage = useCallback", editStart));
    expect(editBody).toContain("Promise<boolean>");
    expect(editBody).toContain("return false");
    expect(editBody).toContain("return true");
    const sendStart = src.indexOf("const sendMessage = useCallback");
    const sendBody = src.slice(sendStart, src.indexOf("const insertOrSendComposerEmoji = useCallback", sendStart));
    expect(sendBody).toContain("const ok = await editRoomMessageText(editTarget.id, raw)");
    expect(sendBody).toContain("return ok");
    expect(sendBody).not.toMatch(/if \(editTarget\?\.id\) \{\s*setMessage\(""\)/);
  });

  it("K-4 emoji pick uses insertOrSendComposerEmoji", () => {
    const sheets = read(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx"
    );
    expect(sheets).toContain("insertOrSendComposerEmoji");
    expect(sheets).not.toContain("void vm.sendMessage(emoji)");
    const ctrl = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    expect(ctrl).toContain("insertEmojiIntoComposerText");
    expect(ctrl).toContain("insertOrSendComposerEmoji");
  });
});
