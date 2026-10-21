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
 * Kakao Native Login — 카카오 공식 권장 순서 (2026-10-22 Owner 위임 결정).
 *
 * 1) 카카오톡 설치 → loginWithKakaoTalk: 카카오톡 앱 동의 화면만 거쳐 바로 복귀 (아이디·비번 입력 없음).
 * 2) 카카오톡 미설치 / 톡 로그인 실패(사용자 취소 제외) → loginWithKakaoAccount:
 *    카카오 계정 웹 로그인. 이미 카카오 계정 세션이 있으면 재입력 없이 진행 (매번 강제 재인증하는 LOGIN 프롬프트 제거).
 * 3) 사용자가 톡에서 취소 → 계정 로그인으로 넘기지 않고 취소로 끝낸다.
 *
 * SDK 2.20.1 has no loginWithKakao().
 */
@CapacitorPlugin(name = "NativeKakaoAuth")
public class NativeKakaoAuthPlugin extends Plugin {

  private static final String TAG = "DIBAY_Kakao";

  private PluginCall pendingCall;

  private void logEvent(String event) {
    Log.i(TAG, event);
  }

  private void rejectPendingCall(String code, String message) {
    PluginCall call = pendingCall;
    pendingCall = null;
    if (call != null) {
      call.reject(code, message);
    }
  }

  private boolean isUserCancelled(Throwable error) {
    if (error instanceof ClientError) {
      ClientErrorCause cause = ((ClientError) error).getReason();
      return cause == ClientErrorCause.Cancelled;
    }
    String message = error != null ? String.valueOf(error.getMessage()) : "";
    return message.toLowerCase().contains("cancel");
  }

  private void logFailure(Throwable error) {
    if (error == null) {
      return;
    }
    String message = error.getMessage() != null ? String.valueOf(error.getMessage()) : error.getClass().getSimpleName();
    if (error instanceof ClientError) {
      logEvent("kakao_native_failed " + message + " cause=" + ((ClientError) error).getReason().name());
      return;
    }
    logEvent("kakao_native_failed " + message);
  }

  private void rejectLoginError(Throwable error) {
    logFailure(error);
    String message = error.getMessage() != null ? String.valueOf(error.getMessage()) : "";
    String lower = message.toLowerCase();
    if (lower.contains("kakaotalk is installed") || lower.contains("keyhash") || lower.contains("key hash")) {
      rejectPendingCall("kakao_native_key_hash_required", message);
      return;
    }
    rejectPendingCall("kakao_native_config_error", message);
  }

  private Function2<OAuthToken, Throwable, Unit> loginCallback = (token, error) -> {
    PluginCall call = pendingCall;
    if (call == null) {
      return Unit.INSTANCE;
    }

    if (error != null) {
      if (isUserCancelled(error)) {
        logEvent("kakao_native_cancelled");
        rejectPendingCall("user_cancelled", "User cancelled Kakao sign-in");
      } else {
        rejectLoginError(error);
      }
      return Unit.INSTANCE;
    }

    if (token == null || token.getAccessToken() == null || token.getAccessToken().trim().isEmpty()) {
      logEvent("kakao_native_token_missing");
      rejectPendingCall("kakao_native_token_missing", "Kakao access token missing");
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
      if (pendingCall != call) {
        if (call != null) {
          call.reject("kakao_native_unavailable", "Kakao sign-in session changed");
        }
        return Unit.INSTANCE;
      }
      if (meError != null) {
        rejectPendingCall("kakao_native_config_error", meError.getMessage() != null ? meError.getMessage() : "Kakao profile fetch failed");
        return Unit.INSTANCE;
      }
      if (user != null && user.getId() != null) {
        result.put("userId", String.valueOf(user.getId()));
      }
      logEvent("kakao_native_success");
      pendingCall = null;
      call.resolve(result);
      return Unit.INSTANCE;
    });

    return Unit.INSTANCE;
  };

  @Override
  protected void handleOnDestroy() {
    // DO NOT reject or clear pendingCall — Kakao SDK may complete after Activity recreate.
    super.handleOnDestroy();
  }

  @PluginMethod
  public void signIn(PluginCall call) {
    logEvent("kakao_native_started");

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
      startKakaoTalkLogin(activity);
    } else {
      startKakaoAccountLogin(activity);
    }
  }

  /** 카카오 공식 샘플: 톡 실패(사용자 취소 제외) 시 계정 로그인으로 전환 */
  private void startKakaoTalkLogin(Activity activity) {
    logEvent("kakao_native_talk_login");
    UserApiClient.getInstance().loginWithKakaoTalk(activity, (token, error) -> {
      if (pendingCall == null) {
        return Unit.INSTANCE;
      }
      if (error != null && !isUserCancelled(error)) {
        logFailure(error);
        logEvent("kakao_native_talk_fallback_account");
        startKakaoAccountLogin(activity);
        return Unit.INSTANCE;
      }
      return loginCallback.invoke(token, error);
    });
  }

  private void startKakaoAccountLogin(Activity activity) {
    if (pendingCall == null) {
      return;
    }
    Activity active = activity != null ? activity : getActivity();
    if (active == null) {
      rejectPendingCall("kakao_native_unavailable", "Activity not found");
      return;
    }
    logEvent("kakao_native_account_login");
    UserApiClient.getInstance().loginWithKakaoAccount(active, loginCallback);
  }

  @PluginMethod
  public void signOut(PluginCall call) {
    UserApiClient.getInstance().logout(error -> {
      if (error != null) {
        logEvent("kakao_native_signout_failed");
      } else {
        logEvent("kakao_native_signout_ok");
      }
      call.resolve();
      return Unit.INSTANCE;
    });
  }
}
