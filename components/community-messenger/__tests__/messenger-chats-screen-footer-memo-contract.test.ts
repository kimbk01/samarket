import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("P-5 MessengerChatsScreen listFooter memo", () => {
  const src = readFileSync(join(process.cwd(), "components/community-messenger/MessengerChatsScreen.tsx"), "utf8");

  it("passes a memoized footer (no inline JSX) so the ChatList memo comparator holds", () => {
    expect(src).toContain("listFooter={pillarListFooter}");
    expect(src).toMatch(/const pillarListFooter = useMemo\(/);
    expect(src).not.toMatch(/listFooter=\{\s*isPillarChatListVisual \?/);
  });

  it("memo deps are primitives + stable loadMore", () => {
    expect(src).toContain(
      "[isPillarChatListVisual, pillarHasMore, pillarLoadingMore, pillarLoadMore, pillarVisibleCount, pillarTotalCount]"
    );
  });

  it("ChatList comparator still compares listFooter by reference", () => {
    const list = readFileSync(join(process.cwd(), "components/community-messenger/chat-list/CommunityMessengerChatList.tsx"), "utf8");
    expect(list).toContain("if (prev.listFooter !== next.listFooter) return false;");
  });
});
