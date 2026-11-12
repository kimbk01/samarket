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
    // 첫 진입 C2: 화면으로 시작한 프로세스만 WebView 엔진을 백그라운드에서 미리 적재 (푸시·통화 수신 기상은 건너뜀)
    DibayWebViewWarmup.startIfLaunchedForUi(this);
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
