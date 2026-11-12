import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

/**
 * 영상 통화 연결·전체 화면 계약 (Owner 2026-11-12 「버튼은 일정 시간 뒤 사라지고 터치하면 보임, 상단 상대·통화 시간·신호는 항상 고정」).
 * 설계: docs/audit/call-video-chrome-signal-border-design-2026-11-12.md D1·D2·D3·D5.
 * Android 1차 반영. iOS 는 D6(별도 PR) 전까지 기존 「Option A」(버튼 상시 표시) 그대로 — 아래 iOS 검사는 현재 상태 고정.
 */
describe("video call connected chrome contract", () => {
  const androidActivity = readFileSync(
    join(ROOT, "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java"),
    "utf8",
  );
  const androidLayout = readFileSync(
    join(ROOT, "android/app/src/main/res/layout/activity_native_video_call.xml"),
    "utf8",
  );
  const androidTier = readFileSync(
    join(ROOT, "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoNetworkTier.java"),
    "utf8",
  );

  it("Android: 버튼 자동 숨김 5초 복구 (Option A 제거)", () => {
    expect(androidActivity).not.toContain("Option A");
    expect(androidActivity).toContain("CONNECTED_CHROME_HIDE_DELAY_MS = 5_000L");
    expect(androidActivity).toMatch(
      /private void scheduleConnectedChromeHide\(String source\) \{[\s\S]*?postDelayed\(chromeHideRunnable, CONNECTED_CHROME_HIDE_DELAY_MS\)/,
    );
    expect(androidActivity).toMatch(
      /private void hideConnectedChrome\(String source\) \{[\s\S]*?applyConnectedChromeHidden\(true\)/,
    );
    // 숨김 중 첫 터치는 보이기만
    expect(androidActivity).toContain("consumeTapWhileChromeHidden");
    // 아주 나쁨·TalkBack 동안 숨기지 않음
    expect(androidActivity).toMatch(
      /connectedChromeAutoHideBlocked\(\) \{[\s\S]*?networkVeryPoorActive[\s\S]*?isTouchExplorationEnabled/,
    );
  });

  it("Android: 상단 이름·통화 시간·신호는 버튼 숨김과 독립으로 항상 보임", () => {
    const sync = androidActivity.match(
      /private void syncPersistentCallStatusVisibility\(\) \{[\s\S]*?\n {2}\}/,
    )?.[0];
    expect(sync).toBeTruthy();
    expect(sync).toContain("connectedChromeOverlay.setVisibility(show ? View.VISIBLE : View.GONE)");
    expect(sync).not.toContain("chromeVisible");
    expect(sync).not.toContain("activeActions.setVisibility");
    expect(androidLayout).toContain('android:layout_gravity="top|center_horizontal"');
  });

  it("Android: 신호 3단계 · 막대 3개 · 측정 중(8)·알 수 없음(0)은 직전 단계 유지", () => {
    expect(androidTier).toMatch(/enum Tier \{\s*GOOD,\s*POOR,\s*VERY_POOR\s*\}/);
    expect(androidLayout).toContain("native_video_call_signal_bar_3");
    expect(androidLayout).not.toContain("native_video_call_signal_bar_4");
    expect(androidActivity).not.toContain("FAIR");
  });

  it("Android: 신호 테두리 뷰는 영상 위·상단 정보 아래, 터치 안 받음", () => {
    const edgeIdx = androidLayout.indexOf("<com.dibay.app.nativevideo.CallSignalEdgeView");
    expect(edgeIdx).toBeGreaterThan(androidLayout.indexOf('android:id="@+id/native_video_call_video_root"'));
    expect(edgeIdx).toBeLessThan(androidLayout.indexOf('android:id="@+id/native_video_call_connected_chrome"'));
    const edgeBlock = androidLayout.slice(edgeIdx, androidLayout.indexOf("/>", edgeIdx));
    expect(edgeBlock).toContain('android:clickable="false"');
    expect(edgeBlock).toContain('android:visibility="gone"');
  });

  it("iOS: D6 전까지 현재 상태(Option A) 그대로", () => {
    const iosVc = readFileSync(
      join(ROOT, "ios/App/App/Call/Video/NativeVideoCallViewController.swift"),
      "utf8",
    );
    expect(iosVc).toContain("syncPersistentCallStatusVisibility");
    expect(iosVc).toContain("Option A: auto-hide disabled");
    expect(iosVc).toContain("infoStack.centerXAnchor.constraint");
    expect(iosVc).toMatch(/syncPersistentCallStatusVisibility[\s\S]*activeActions\.isHidden = false/);
  });
});
