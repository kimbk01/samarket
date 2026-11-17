import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 수신 벨 중 ◁ (2026-11-18 실기 FAIL · docs/audit/android-system-nav-2026-11-17/incoming-back-return-path-plan.md)
 * — ◁ 는 화면만 내리고 앱으로 간다(S2 P1). 수신 화면이 보일 때 지운 수신 알림(받기·거절)을 다시 올려야
 * 「살아 있는 통화에는 돌아갈 수단이 항상 있다」(§2-3) 가 지켜진다.
 */
const BASE = "android/app/src/main/java/com/dibay/app";
const LANES = [
  {
    kind: "voice",
    activity: `${BASE}/nativevoice/NativeVoiceCallActivity.java`,
    runtime: `${BASE}/nativevoice/NativeVoiceCallRuntime.java`,
    runtimeClass: "NativeVoiceCallRuntime",
    notification: "NativeVoiceCallNotification",
  },
  {
    kind: "video",
    activity: `${BASE}/nativevideo/NativeVideoCallActivity.java`,
    runtime: `${BASE}/nativevideo/NativeVideoCallRuntime.java`,
    runtimeClass: "NativeVideoCallRuntime",
    notification: "NativeVideoCallNotification",
  },
] as const;

function body(src: string, signature: string): string {
  const start = src.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unclosed ${signature}`);
}

describe.each(LANES)("수신 벨 중 ◁ 돌아갈 수단 ($kind)", (lane) => {
  it("◁ 로 앱에 간 뒤 Runtime 에 수신 알림 재게시를 요청한다", () => {
    const leave = body(readFileSync(lane.activity, "utf8"), "private boolean leavePreConnectedCallToApp(");
    expect(leave).toContain("NativeCallAppReturn.bringAppToFront(");
    expect(leave).toContain(`${lane.runtimeClass}.ensureIncomingReturnPathAfterLeave(`);
    // 취소·거절로 바꾸지 않는다(S2 P1).
    expect(leave).not.toMatch(/decline|reject|endCall|finish\(\);\s*\n\s*return left/);
  });

  it("수신(!initiator)·RINGING 일 때만 기존 수신 알림을 다시 올린다", () => {
    const fn = body(
      readFileSync(lane.runtime, "utf8"),
      "public static boolean ensureIncomingReturnPathAfterLeave(",
    );
    expect(fn).toContain("session.initiator");
    expect(fn).toContain("State.RINGING");
    expect(fn).toContain(`${lane.notification}.dismiss(app, sid);`);
    expect(fn).toContain(`${lane.notification}.showIncoming(app, session);`);
    expect(fn.indexOf(".dismiss(")).toBeLessThan(fn.indexOf(".showIncoming("));
  });

  it("다시 올린 뒤 수신 화면으로 돌아오면(onResume) 알림 시각 표시를 다시 지운다(화면·알림 중복 없음)", () => {
    const src = readFileSync(lane.activity, "utf8");
    expect(body(src, "private boolean leavePreConnectedCallToApp(")).toContain("incomingReturnPathPosted = true;");
    const resume = body(src, "protected void onResume(");
    expect(resume).toContain("incomingReturnPathPosted = false;");
    expect(resume).toContain(`${lane.notification}.suppressVisualAfterActivityShown(this, callId);`);
    expect(resume).toContain("State.RINGING");
  });
});
