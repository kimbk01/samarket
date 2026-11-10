import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((href: string) => {
  throw new Error(`REDIRECT:${href}`);
});
vi.mock("next/navigation", () => ({ redirect: (href: string) => redirectMock(href) }));

import CommunityMessengerCallLogsPage from "@/app/(main)/community-messenger/calls/logs/page";

/** 채팅 시안 4판: 통화 기록 별도 주소 → 통화 탭 (예전 별도 화면은 기록이 있어도 「통화 기록이 없습니다」) */
describe("/community-messenger/calls/logs", () => {
  it("통화 탭으로 보낸다", async () => {
    await expect(CommunityMessengerCallLogsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/community-messenger?section=call_logs"
    );
  });

  it("메신저 진입 출처(from)는 유지, 알림 링크의 callId 등은 버린다", async () => {
    await expect(
      CommunityMessengerCallLogsPage({ searchParams: Promise.resolve({ from: "community", callId: "sess-1" }) })
    ).rejects.toThrow("REDIRECT:/community-messenger?section=call_logs&from=community");
  });
});
