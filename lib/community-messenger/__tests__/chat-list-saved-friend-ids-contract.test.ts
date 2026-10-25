import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** §15: 대화 목록 → 행으로 savedFriendIds 전달 (누락 시 친구 아님 배지가 실기기에서 안 뜸, 2026-10-25 21:22 PHT 확인) */
describe("chat list passes savedFriendIds to rows", () => {
  it("rowProps 와 memo 비교에 savedFriendIds 포함", () => {
    const src = readFileSync(join(process.cwd(), "components/community-messenger/chat-list/CommunityMessengerChatList.tsx"), "utf8");
    expect(src).toContain("savedFriendIds: props.savedFriendIds,");
    expect(src).toContain("prev.savedFriendIds !== next.savedFriendIds");
  });
});
