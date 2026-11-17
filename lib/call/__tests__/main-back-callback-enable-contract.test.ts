import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * S2 (Owner 승인 2026-11-18 · docs/audit/android-system-nav-2026-11-17/s2-s4-design.md §3):
 * Android 기준 「앞의 처리가 모두 꺼져 있으면 시스템이 처리한다」. MainActivity 의 통화용 뒤로 처리는
 * 웹 통화(네이티브 통화 화면 소유가 아닌 통화)가 연결된 동안에만 켠다. 통화가 없을 때 첫 화면 ◁ 를
 * 가로채면(TYPE_CALLBACK) Android 의 홈 이동 처리(TYPE_RETURN_TO_HOME)를 막는다(실측 2026-11-18 04:42).
 */
const BASE = "android/app/src/main/java/com/dibay/app";
const main = readFileSync(`${BASE}/MainActivity.java`, "utf8");
const manager = readFileSync(`${BASE}/call/DibayActiveCallSessionManager.java`, "utf8");

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

describe("MainActivity 통화용 뒤로 처리 (S2)", () => {
  it("기본 꺼짐 — 항상 켜진 뒤로 처리를 두지 않는다", () => {
    const reg = body(main, "private void registerActiveCallBackPressedCallback()");
    expect(reg).toContain("new OnBackPressedCallback(false)");
    expect(reg).not.toContain("new OnBackPressedCallback(true)");
  });

  it("켜짐 = 웹 통화 연결 중(연결됨 && 네이티브 소유 아님)", () => {
    const refresh = body(main, "private void refreshActiveCallBackPressedEnabled()");
    expect(refresh).toContain("DibayActiveCallSessionManager.isConnected()");
    expect(refresh).toContain("!com.dibay.app.call.NativeCallAppReturn.isNativeOwnedCall(callId)");
  });

  it("통화 상태·소유권이 바뀔 때와 앱이 앞으로 올 때 다시 계산한다", () => {
    expect(main).toContain("DibayActiveCallSessionManager.setStateListener(activeCallBackStateListener)");
    expect(body(main, "public void onResume()")).toContain("refreshActiveCallBackPressedEnabled()");
    expect(body(main, "public void onDestroy()")).toContain("clearStateListener(activeCallBackStateListener)");
    for (const sig of [
      "public static void bindActiveCall(",
      "public static void transitionPhase(",
      "public static void clearSession()",
    ]) {
      expect(body(manager, sig), sig).toContain("notifyStateChanged()");
    }
    for (const owner of [
      `${BASE}/nativevoice/NativeVoiceCallOwner.java`,
      `${BASE}/nativevideo/NativeVideoCallOwner.java`,
    ]) {
      const src = readFileSync(owner, "utf8");
      expect(body(src, "public static boolean claimNative(")).toContain("notifyStateChanged()");
      expect(body(src, "public static void release(")).toContain("notifyStateChanged()");
    }
  });

  it("통화 중 동작(PiP·뒤로 보내기)은 그대로", () => {
    const reg = body(main, "private void registerActiveCallBackPressedCallback()");
    expect(reg).toContain("tryEnterVideoCallPip()");
    expect(reg).toContain("moveTaskToBack(false)");
  });
});
