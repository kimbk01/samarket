import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const composer = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx");
const pass1 = read("components/community-messenger/room/CommunityMessengerRoomPass1ComposerShell.tsx");

describe("Phase2 composer input contract (K-1, K-5, K-6, K-7)", () => {
  it("K-1: Enter handling goes through the shared D3 policy (Phase2 + Pass1)", () => {
    for (const src of [composer, pass1]) {
      expect(src).toContain("resolveMessengerComposerKeyAction(");
      expect(src).toContain("isMessengerComposerMobileInputEnvironment()");
      expect(src).toContain("keyCode: e.nativeEvent.keyCode");
    }
    expect(composer).not.toMatch(/if \(e\.key !== "Enter" && e\.key !== "NumpadEnter"\) return;/);
  });

  it("K-5: draft keyed by viewer+room, restored on mount, debounced save, cleared on success", () => {
    expect(composer).toContain("messengerComposerDraftKey(vm.snapshot.viewerUserId, roomKey)");
    expect(composer).toContain("useState(() => readMessengerComposerDraft(draftStoreKey))");
    expect(composer).toContain("MESSENGER_COMPOSER_DRAFT_SAVE_DEBOUNCE_MS");
    expect(composer).toContain("clearMessengerComposerDraft(draftStoreKey)");
    // heavy enable alone must not overwrite the restored draft
    expect(composer).toContain("if (vm.message === lastSyncedPhase1MessageRef.current) return;");
  });

  it("K-6: composition tracked; send during composition deferred to compositionend; no blur", () => {
    expect(composer).toContain("onTextareaCompositionStart");
    expect(composer).toContain("onTextareaCompositionEnd");
    expect(composer).toContain("deferredSendPendingRef.current = true");
    expect(composer).toContain("localTextareaRef.current?.value ?? draftRef.current");
    const commit = composer.slice(composer.indexOf("const commitTextSendValue"), composer.indexOf("const composerFooterInner"));
    expect(commit).not.toContain(".blur()");
  });

  it("K-7: mention list uses arrow/Enter selection with live active index", () => {
    expect(composer).toContain("nextMentionActiveIndex(i, action.delta, filteredMentionCandidates.length)");
    expect(composer).toContain("activeIndex={mentionActiveIndexClamped}");
    expect(composer).toContain('case "mention_pick"');
  });
});
