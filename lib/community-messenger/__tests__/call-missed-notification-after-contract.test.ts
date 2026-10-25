/**
 * §14-10 C-N2 — 부재중 알림은 응답 뒤 `after()` 로 실행해야 Vercel 이 중간에 끊지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");

describe("missed call notification — after() 보장", () => {
  it("부재중 알림을 void 로 띄우지 않는다", () => {
    expect(src).not.toMatch(/void\s+notifyRoomBoundMissedCallBestEffort\(/);
  });

  it("상태 변경 2곳 모두 after() 예약 함수를 쓴다", () => {
    expect(src.match(/\bscheduleRoomBoundMissedCallNotification\(session, mapped\)/g)?.length).toBe(2);
    const helper = src.slice(src.indexOf("function scheduleRoomBoundMissedCallNotification("));
    expect(helper.slice(0, 600)).toMatch(/after\(run\)/);
  });
});
