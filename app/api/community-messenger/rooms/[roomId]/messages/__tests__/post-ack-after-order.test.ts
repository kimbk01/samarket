import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M-1 + P2 (2026-11-18 보수안) — 1:1 텍스트 전송 route 순서 계약(소스 순서 잠금).
 * ① target bump ‖ durable 동시 시작 → ② await target → ③ await durable → ④ 방 bump 시작(after(promise))
 * → ⑤ 자동 읽음 → 응답 → after(): FCM/미러(방 bump 와 실패 격리).
 */
const src = readFileSync(
  join(process.cwd(), "app/api/community-messenger/rooms/[roomId]/messages/route.ts"),
  "utf8"
);

describe("community-messenger 1:1 messages send order (M-1 · P2)", () => {
  it("target → durable → room bump start → auto-read → response", () => {
    const target = src.indexOf("await targetPromise");
    const durable = src.indexOf("deferredPostAck = await durablePromise");
    const bumpStart = src.indexOf("after(bumpPromise)");
    const autoRead = src.indexOf("markRoomRead(sb, rid, canonicalRoomId)");
    const respond = src.indexOf("let responsePayload");
    for (const idx of [target, durable, bumpStart, autoRead, respond]) expect(idx).toBeGreaterThan(0);
    expect(target).toBeLessThan(durable);
    expect(durable).toBeLessThan(bumpStart);
    expect(bumpStart).toBeLessThan(autoRead);
    expect(autoRead).toBeLessThan(respond);
  });

  it("room bump is never awaited before ACK (only after(promise) holds its lifetime)", () => {
    const beforeRespond = src.slice(0, src.indexOf("let responsePayload"));
    expect(beforeRespond).not.toContain("await bumpPromise");
    /** publishTextSendRoomBump 를 await 하는 곳은 after 에 넘긴 프로미스 본문·폴백 after 안뿐 */
    const bumpBody = beforeRespond.slice(
      beforeRespond.indexOf("const bumpPromise = (async () => {"),
      beforeRespond.indexOf("after(bumpPromise)")
    );
    expect(bumpBody).toContain("await publishTextSendRoomBump(bumpArgs)");
    expect(beforeRespond).not.toContain("await publishMessengerRoomBumpAfterMutation");
  });

  it("FCM/mirror stay in after() with isolated catch (bump failure does not skip push)", () => {
    const fcm = src.lastIndexOf("runCommunityMessengerSendDeferredPostAckEffects(sb, deferredPostAck");
    const afterOpen = src.lastIndexOf("after(async () => {", fcm);
    expect(fcm).toBeGreaterThan(0);
    expect(afterOpen).toBeGreaterThan(src.indexOf("after(bumpPromise)"));
    expect(src.slice(afterOpen, src.indexOf("let responsePayload"))).toMatch(
      /runCommunityMessengerSendDeferredPostAckEffects[\s\S]*?catch/
    );
  });
});
