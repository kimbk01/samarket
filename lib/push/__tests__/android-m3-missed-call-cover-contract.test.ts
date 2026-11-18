/**
 * M3 (Owner 승인 2026-11-18 · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md §24-15) — Android 빌드 79.
 * 채팅방·메신저 목록으로 가는 부재중 알림만 통화 실행에서 뺀다. 그 밖의 통화 판정은 그대로.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const main = fs.readFileSync(
  path.resolve(__dirname, "../../../android/app/src/main/java/com/dibay/app/MainActivity.java"),
  "utf8"
);

function body(startMarker: string, endMarker: string): string {
  const a = main.indexOf(startMarker);
  const b = main.indexOf(endMarker, a + startMarker.length);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return main.slice(a, b);
}

describe("M3 부재중 알림 덮개", () => {
  it("isCallLaunch 첫 판정 = 부재중·비통화 경로 제외 · 기존 통화 판정은 그 뒤에 그대로", () => {
    const fn = body("static boolean isCallLaunch(Intent intent) {", "static boolean isMissedCallLaunchToNonCallPath(");
    const m3 = fn.indexOf("if (isMissedCallLaunchToNonCallPath(intent)) return false;");
    expect(m3).toBeGreaterThan(-1);
    const rest = fn.slice(m3);
    expect(rest).toContain('if ("call".equals(host) || "call-v4".equals(host)) return true;');
    expect(rest).toContain("EXTRA_V4_LOCK_BACKGROUND_HYDRATION");
    expect(rest).toContain('"call_push_kind", "dibay_call", "call_id", "callId", "call_type", "callType"');
    expect(rest).toContain('.contains("call")) return true;');
  });

  it("부재중 판정: 종류가 정확히 missed_call · 경로가 /community-messenger/calls 밖일 때만", () => {
    const fn = body("static boolean isMissedCallLaunchToNonCallPath(", "\n  }\n");
    expect(fn).toContain('if (!"missed_call".equals(FcmPayloadResolver.resolveType(data))) return false;');
    expect(fn).toContain("String path = resolveAppPathFromPushExtras(ex);");
    expect(fn).toContain('!path.startsWith("/community-messenger/calls")');
  });

  it("호출처는 isCallLaunch 1곳", () => {
    expect(main.match(/isMissedCallLaunchToNonCallPath\(intent\)/g)?.length).toBe(1);
  });
});
