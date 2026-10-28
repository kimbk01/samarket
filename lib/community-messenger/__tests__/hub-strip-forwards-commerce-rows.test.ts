/**
 * 2026-10-28 실기: 대화 홈 재동기화가 가져온 거래 방 행을 버리기만 해 「거래 채팅」 묶음 줄이 예전 문장으로 남음.
 * 버리기 전에 거래/주문 목록 캐시로 넘긴다(새 메시지일 때만 안 읽음 반영).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("hub strip → domain list forward", () => {
  it("stripCommerceDomainRowsFromHubLists 가 버리기 전에 forwardCommerceRowToDomainList 를 부른다", () => {
    const src = readFileSync("lib/community-messenger/home-list-patch.ts", "utf8");
    expect(src).toMatch(/forwardCommerceRowToDomainList\(r, data\.me\?\.id \?\? ""\);\s*logListAuthorityViolation\("DOMAIN_ROW_LEAK"/);
    expect(src).toContain("if (applied && typeof r.unreadCount === \"number\")");
  });
});
