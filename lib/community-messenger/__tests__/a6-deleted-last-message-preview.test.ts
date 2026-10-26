import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveDeletedMessagePlaceholder } from "@/lib/community-messenger/message-actions/message-reply-policy";

/**
 * A-6 (10-27 07:40:33 Samsung 재현): 마지막 메시지 「모두에게서 삭제」 → 방 화면 「삭제된 메시지입니다」,
 * 목록·rooms.last_message 「새 메시지」. 서버 재계산이 deleted_for_everyone_at 을 보지 않고 빈 본문을 일반 텍스트로 요약.
 */
describe("A-6 삭제된 마지막 메시지 목록 미리보기", () => {
  const svc = readFileSync("lib/community-messenger/service.ts", "utf8");
  const i = svc.indexOf("async function recomputeCommunityMessengerRoomLastMessage");
  const body = svc.slice(i, svc.indexOf("\n}\n", i));

  it("서버 재계산이 삭제 여부를 읽고 방 화면과 같은 문구를 쓴다(관리자 숨김보다 우선)", () => {
    expect(body).toContain("deleted_for_everyone_at");
    expect(body).toContain("resolveDeletedMessagePlaceholder()");
    expect(body.indexOf("resolveDeletedMessagePlaceholder()")).toBeLessThan(
      body.indexOf("resolveAdminHiddenMessagePlaceholder()")
    );
  });

  it("문구는 방 화면 삭제 표시와 같다", () => {
    expect(resolveDeletedMessagePlaceholder()).toBe("삭제된 메시지입니다");
  });
});
