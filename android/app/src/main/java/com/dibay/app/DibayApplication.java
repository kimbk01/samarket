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
