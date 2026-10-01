package com.dibay.app;

import android.app.Activity;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.auth.model.Prompt;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import com.kakao.sdk.user.UserApiClient;
import java.util.Collections;
import java.util.List;
import kotlin.Unit;
import kotlin.jvm.functions.Function2;

/**
 * Kakao Native Login — ONE CTA → Kakao Account authentication with Prompt.LOGIN.
 *
 * Talk-first was removed: automatic loginWithKakaoTalk selected the Talk-bound account
 * with no meaningful user choice (Owner FAIL). SDK 2.20.1 has no loginWithKakao().
 *
 * Canonical: loginWithKakaoAccount(prompts = [Prompt.LOGIN]).
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
    startKakaoAccountLoginWithPromptLogin(activity);
  }

  /**
   * Canonical ONE-CTA dispatch (SDK 2.20.1): Kakao Account + Prompt.LOGIN.
   * Does not call loginWithKakaoTalk — avoids silent Talk-bound account selection.
   */
  private void startKakaoAccountLoginWithPromptLogin(Activity activity) {
    logEvent("kakao_native_account_login_prompt_login");
    List<Prompt> prompts = Collections.singletonList(Prompt.LOGIN);
    UserApiClient.getInstance().loginWithKakaoAccount(activity, prompts, loginCallback);
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
