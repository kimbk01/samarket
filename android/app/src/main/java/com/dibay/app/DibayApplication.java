package com.dibay.app;

import android.app.Application;
import android.util.Log;
import com.dibay.app.call.ResumedActivityTracker;
import com.kakao.sdk.common.KakaoSdk;
import com.tiktok.TikTokBusinessSdk;

public class DibayApplication extends Application {
  private static final String TAG = "DIBAY_Kakao";

  @Override
  public void onCreate() {
    super.onCreate();
    ResumedActivityTracker.register(this);
    DibayNotificationSoundChannelStore.init(this);
    // 언어 SSOT S8-4: 이미 있는 알림 채널 이름·설명을 지금 언어로 (언어·문구 판이 같으면 바로 끝)
    DibayNotificationChannelLabels.relabelIfNeeded(this);
    initTikTokAppEvents();
    String appKey = getString(R.string.kakao_native_app_key).trim();
    if (appKey.isEmpty()) {
      Log.w(TAG, "kakao_native_app_key_missing");
      return;
    }
    try {
      KakaoSdk.init(this, appKey);
    } catch (Exception error) {
      Log.e(TAG, "kakao_sdk_init_failed", error);
    }
  }

  /**
   * TikTok App Events SDK — 앱 설치·실행 자동 기록(틱톡 앱 설치 광고 측정).
   * 설계: docs/audit/ads-sdk-google-tiktok-design-2026-11-27.md. 값이 없으면 호출하지 않는다.
   */
  private void initTikTokAppEvents() {
    String ttAppId = getString(R.string.tiktok_app_id).trim();
    String ttSecret = getString(R.string.tiktok_app_secret).trim();
    if (ttAppId.isEmpty() || ttSecret.isEmpty()) {
      Log.w("DIBAY_TikTok", "tiktok_app_id_missing");
      return;
    }
    try {
      TikTokBusinessSdk.TTConfig config =
          new TikTokBusinessSdk.TTConfig(this, ttSecret)
              .setAppId(getPackageName())
              .setTTAppId(ttAppId);
      TikTokBusinessSdk.initializeSdk(config);
    } catch (Throwable error) {
      Log.e("DIBAY_TikTok", "tiktok_sdk_init_failed", error);
    }
  }
}
