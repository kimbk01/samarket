import { afterEach, describe, expect, it, vi } from "vitest";
import { postNotificationEventOpenedRead } from "@/lib/notifications/client/notification-event-read-client";

describe("알림 읽음 클라이언트 — uuid 가 아닌 ID 는 요청하지 않음 (G3 · 2026-11-16)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("부재중 알림 tag(missed:<callId>)로는 읽음 API 를 부르지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await postNotificationEventOpenedRead("missed:42ed06d5-df1c-4ae7-846a-a9499f7259a3", { requireMemberA: true })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
