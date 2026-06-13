package com.dibay.app;

import android.app.Activity;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import com.kakao.sdk.user.UserApiClient;
import kotlin.Unit;
import kotlin.jvm.functions.Function2;

/**
 * Kakao Native Login — 카카오톡 앱 우선, 미설치 시 카카오 계정(SDK WebView).
 * Chrome / Custom Tab / 외부 브라우저 OAuth 금지.
 */
@CapacitorPlugin(name = "NativeKakaoAuth")
public class NativeKakaoAuthPlugin extends Plugin {

  private static final String TAG = "DIBAY_Kakao";

  private PluginCall pendingCall;

  private void logEvent(String event, String detail) {
    String message = detail == null || detail.isEmpty() ? event : event + " " + detail;
    Log.i(TAG, message);
  }

  private boolean isUserCancelled(Throwable error) {
    if (error instanceof ClientError) {
      ClientErrorCause cause = ((ClientError) error).getReason();
      return cause == ClientErrorCause.Cancelled;
    }
    String message = error != null ? String.valueOf(error.getMessage()) : "";
    return message.toLowerCase().contains("cancel");
  }

  private Function2<OAuthToken, Throwable, Unit> loginCallback = (token, error) -> {
    PluginCall call = pendingCall;
    pendingCall = null;
    if (call == null) {
      return Unit.INSTANCE;
    }

    if (error != null) {
      if (isUserCancelled(error)) {
        logEvent("kakao_native_cancelled", "");
        call.reject("user_cancelled", "User cancelled Kakao sign-in");
      } else {
        logEvent("kakao_native_config_error", error.getMessage());
        call.reject("kakao_native_config_error", error.getMessage());
      }
      return Unit.INSTANCE;
    }

    if (token == null || token.getAccessToken() == null || token.getAccessToken().trim().isEmpty()) {
      logEvent("kakao_native_token_missing", "");
      call.reject("kakao_native_token_missing", "Kakao access token missing");
      return Unit.INSTANCE;
    }

    JSObject result = new JSObject();
    result.put("provider", "kakao");
    result.put("accessToken", token.getAccessToken());
    if (token.getRefreshToken() != null && !token.getRefreshToken().trim().isEmpty()) {
      result.put("refreshToken", token.getRefreshToken());
    }
    if (token.getIdToken() != null && !token.getIdToken().trim().isEmpty()) {
      result.put("idToken", token.getIdToken());
    }

    UserApiClient.getInstance().me((user, meError) -> {
      if (user != null && user.getId() != null) {
        result.put("userId", String.valueOf(user.getId()));
      }
      logEvent("kakao_native_success", "hasToken=true");
      call.resolve(result);
      return Unit.INSTANCE;
    });

    return Unit.INSTANCE;
  };

  @PluginMethod
  public void signIn(PluginCall call) {
    logEvent("NativeKakaoAuth.signIn called", "");
    logEvent("kakao_native_started", "");

    if (pendingCall != null) {
      call.reject("kakao_native_in_flight", "Another Kakao sign-in is already in progress");
      return;
    }

    String appKey = getContext().getString(R.string.kakao_native_app_key).trim();
    if (appKey.isEmpty()) {
      call.reject("kakao_native_config_error", "KAKAO_NATIVE_APP_KEY is not configured");
      return;
    }

    Activity activity = getActivity();
    if (activity == null) {
      call.reject("kakao_native_unavailable", "Activity not found");
      return;
    }

    pendingCall = call;

    if (UserApiClient.getInstance().isKakaoTalkLoginAvailable(activity)) {
      logEvent("kakao_native_talk_login", "");
      UserApiClient.getInstance().loginWithKakaoTalk(activity, loginCallback);
    } else {
      logEvent("kakao_native_account_login", "");
      UserApiClient.getInstance().loginWithKakaoAccount(activity, loginCallback);
    }
  }

  @PluginMethod
  public void signOut(PluginCall call) {
    UserApiClient.getInstance().logout(error -> {
      if (error != null) {
        logEvent("kakao_native_signout_failed", error.getMessage());
      } else {
        logEvent("kakao_native_signout_ok", "");
      }
      call.resolve();
      return Unit.INSTANCE;
    });
  }
}
