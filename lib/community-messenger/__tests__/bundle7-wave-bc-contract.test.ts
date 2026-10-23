import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSwipeActions } from "@/lib/messenger-policy/chat-room-swipe-actions";
import {
  clearRoomComposerDraft,
  readRoomComposerDraft,
  writeRoomComposerDraft,
} from "@/lib/community-messenger/room/messenger-room-composer-draft-storage";
import { useMessengerTypingStore, resetMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";

describe("Bundle7 Wave B contracts", () => {
  it("L-9: room-level archived disables restore CTA when viewer not archived", () => {
    const actions = getSwipeActions({
      policyType: "direct",
      listContext: "archive",
      roomStatusArchived: true,
      isArchivedByViewer: false,
    });
    expect(actions.find((a) => a.kind === "archive")?.disabled).toBe(true);
  });

  it("L-9: viewer-archived restore remains enabled", () => {
    const actions = getSwipeActions({
      policyType: "direct",
      listContext: "archive",
      roomStatusArchived: false,
      isArchivedByViewer: true,
    });
    expect(actions.find((a) => a.kind === "archive")?.disabled).toBe(false);
  });

  it("F-6: relations/friend POST gates signup/profile", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/community-messenger/relations/friend/route.ts"),
      "utf8"
    );
    expect(src).toContain("gateFriendAddProfile");
    expect(src).toContain("requireSignupCompleteForUser");
    expect(src).toContain("messenger_add_friend");
    const postIdx = src.indexOf("export async function POST");
    expect(src.indexOf("gateFriendAddProfile", postIdx)).toBeGreaterThan(postIdx);
  });

  it("L-5: trade list wires scroll/outside swipe close", () => {
    const src = readFileSync(
      join(process.cwd(), "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx"),
      "utf8"
    );
    expect(src).toContain("onScrollCapture={closeOpenedSwipe}");
    expect(src).toContain("onPointerDownCapture");
    expect(src).toContain("closeOpenedSwipe");
  });

  it("L-11: closed swipe actions use tabIndex=-1", () => {
    const src = readFileSync(
      join(process.cwd(), "components/community-messenger/MessengerChatListItem.tsx"),
      "utf8"
    );
    expect(src).toContain("tabIndex={!swipeOpen && dragX > -16 ? -1 : 0}");
    expect(src).toContain("inert=");
  });

  it("F-5: DotMenu uses friend-request client with busy guard", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2OneToOneDotMenu.tsx"
      ),
      "utf8"
    );
    expect(src).toContain("postCommunityMessengerFriendRequestApi");
    expect(src).toContain("friendRequestBusyRef");
  });
});

describe("Bundle7 Wave C contracts", () => {
  it("P-1: clearExpired returns same state when nothing expired", () => {
    resetMessengerTypingStore();
    useMessengerTypingStore.getState().setTyping("room-a", "user-1", 60_000);
    const before = useMessengerTypingStore.getState();
    useMessengerTypingStore.getState().clearExpired(Date.now());
    const after = useMessengerTypingStore.getState();
    expect(after.byRoomId).toBe(before.byRoomId);
  });

  it("K-5: room drafts are isolated and survive sessionStorage failure shape", () => {
    writeRoomComposerDraft("room-1", "hello");
    writeRoomComposerDraft("room-2", "world");
    expect(readRoomComposerDraft("room-1")).toBe("hello");
    expect(readRoomComposerDraft("room-2")).toBe("world");
    clearRoomComposerDraft("room-1");
    expect(readRoomComposerDraft("room-1")).toBe("");
    expect(readRoomComposerDraft("room-2")).toBe("world");
  });

  it("K-7: composer keydown handles mention arrows/enter/IME", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx"
      ),
      "utf8"
    );
    expect(src).toContain('e.key === "ArrowDown"');
    expect(src).toContain('e.key === "ArrowUp"');
    expect(src).toContain("keyCode === 229");
    expect(src).toContain("isComposing");
  });
});
