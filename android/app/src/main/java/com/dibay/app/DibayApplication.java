package com.dibay.app;

import android.app.Application;
import android.util.Log;
import com.dibay.app.call.ResumedActivityTracker;
import com.kakao.sdk.common.KakaoSdk;

public class DibayApplication extends Application {
  private static final String TAG = "DIBAY_Kakao";

  @Override
  public void onCreate() {
    super.onCreate();
    ResumedActivityTracker.register(this);
    DibayNotificationSoundChannelStore.init(this);
    // 언어 SSOT S8-4: 이미 있는 알림 채널 이름·설명을 지금 언어로 (언어·문구 판이 같으면 바로 끝)
    DibayNotificationChannelLabels.relabelIfNeeded(this);
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
}
