package com.dibay.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;

/**
 * Google Native Login — Google Sign-In SDK (id_token).
 * Chrome / Custom Tab / 외부 브라우저 OAuth 금지 — Android 앱 전용.
 *
 * startActivityForResult 는 Bridge 에 PluginCall 을 저장한다.
 * Google 계정 UI 로 Activity 가 destroy 되어도 handleOnDestroy 에서 reject 하면 안 된다.
 * 프로세스 재시작 시 recoverSignInIfPending + silentSignIn 으로 exchange 를 이어간다.
 */
@CapacitorPlugin(name = "NativeGoogleAuth")
public class NativeGoogleAuthPlugin extends Plugin {

  private static final String TAG = "DIBAY_Google";
  private static final String PREFS_NAME = "dibay_google_native_auth";
  private static final String PREF_EXCHANGE_PENDING = "google_native_exchange_pending";
  private static final String PREF_EXCHANGE_NEXT = "google_native_exchange_next";
  private static final String PREF_PENDING_ID_TOKEN = "google_native_pending_id_token";

  private GoogleSignInClient googleSignInClient;
  private PluginCall pendingCall;

  @Override
  public void load() {
    String webClientId = getContext().getString(R.string.google_web_client_id);
    if (webClientId == null || webClientId.trim().isEmpty()) {
      Log.w(TAG, "google_native_config_missing GOOGLE_WEB_CLIENT_ID not set");
      return;
    }
    GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
      .requestIdToken(webClientId.trim())
      .requestEmail()
      .build();
    googleSignInClient = GoogleSignIn.getClient(getContext(), options);
  }

  private SharedPreferences authPrefs() {
    return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
  }

  private void logEvent(String event) {
    Log.i(TAG, event);
  }

  private void markExchangePending(PluginCall call) {
    SharedPreferences.Editor editor = authPrefs().edit().putBoolean(PREF_EXCHANGE_PENDING, true);
    String next = call.getString("next");
    if (next != null && !next.trim().isEmpty()) {
      editor.putString(PREF_EXCHANGE_NEXT, next.trim());
    } else {
      editor.remove(PREF_EXCHANGE_NEXT);
    }
    editor.apply();
    logEvent("google_native_exchange_pending");
  }

  private void clearExchangePending() {
    authPrefs()
      .edit()
      .remove(PREF_EXCHANGE_PENDING)
      .remove(PREF_EXCHANGE_NEXT)
      .remove(PREF_PENDING_ID_TOKEN)
      .apply();
  }

  private void saveDeferredSignInResult(GoogleSignInAccount account) {
    String idToken = account.getIdToken();
    if (idToken == null || idToken.trim().isEmpty()) {
      logEvent("google_native_deferred_token_missing");
      return;
    }
    authPrefs().edit().putString(PREF_PENDING_ID_TOKEN, idToken.trim()).apply();
    logEvent("google_native_deferred_token_saved");
  }

  private GoogleSignInAccount resolveSignInAccountFromResult(Intent data) {
    if (data != null) {
      try {
        return GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException.class);
      } catch (ApiException error) {
        logEvent("google_native_intent_parse_failed " + error.getStatusCode() + " " + error.getMessage());
      }
    }
    GoogleSignInAccount last = GoogleSignIn.getLastSignedInAccount(getContext());
    if (last != null && last.getIdToken() != null && !last.getIdToken().trim().isEmpty()) {
      logEvent("google_native_last_signed_in_account");
      return last;
    }
    return null;
  }

  private void resolveDeferredTokenToCall(PluginCall call) {
    String deferredToken = authPrefs().getString(PREF_PENDING_ID_TOKEN, null);
    if (deferredToken == null || deferredToken.trim().isEmpty()) {
      return;
    }
    authPrefs().edit().remove(PREF_PENDING_ID_TOKEN).apply();
    String next = authPrefs().getString(PREF_EXCHANGE_NEXT, null);
    clearExchangePending();
    logEvent("google_native_recover_deferred_token");
    JSObject ret = new JSObject();
    ret.put("provider", "google");
    ret.put("recovered", true);
    ret.put("idToken", deferredToken.trim());
    if (next != null && !next.trim().isEmpty()) {
      ret.put("next", next);
    }
    call.resolve(ret);
  }

  private void resolveAccountToCall(PluginCall call, GoogleSignInAccount account, boolean recovered) {
    String idToken = account.getIdToken();
    if (idToken == null || idToken.trim().isEmpty()) {
      logEvent("google_native_token_missing");
      call.reject("google_native_token_missing", "Google id token is missing");
      return;
    }
    logEvent(recovered ? "google_native_recover_success" : "google_native_success");
    String next = authPrefs().getString(PREF_EXCHANGE_NEXT, null);
    clearExchangePending();
    JSObject ret = new JSObject();
    ret.put("provider", "google");
    ret.put("recovered", recovered);
    ret.put("idToken", idToken);
    if (account.getId() != null) {
      ret.put("userId", account.getId());
    }
    if (account.getEmail() != null) {
      ret.put("email", account.getEmail());
    }
    if (next != null && !next.trim().isEmpty()) {
      ret.put("next", next);
    }
    call.resolve(ret);
  }

  @Override
  protected void handleOnDestroy() {
    // DO NOT reject or clear pendingCall — Capacitor @ActivityCallback may need it after recreate.
    super.handleOnDestroy();
  }

  @Override
  protected void handleOnResume() {
    super.handleOnResume();
    if (authPrefs().getBoolean(PREF_EXCHANGE_PENDING, false)) {
      logEvent("google_native_resume_exchange_pending");
    }
  }

  @PluginMethod
  public void signIn(PluginCall call) {
    if (pendingCall != null) {
      call.reject("google_native_in_flight", "Another Google sign-in is already in progress");
      return;
    }
    if (googleSignInClient == null) {
      call.reject("google_native_config_error", "GOOGLE_WEB_CLIENT_ID is not configured");
      return;
    }
    pendingCall = call;
    markExchangePending(call);
    logEvent("google_native_started");
    Intent signInIntent = googleSignInClient.getSignInIntent();
    startActivityForResult(call, signInIntent, "googleSignInResult");
  }

  @PluginMethod
  public void recoverSignInIfPending(PluginCall call) {
    if (googleSignInClient == null) {
      call.reject("google_native_config_error", "GOOGLE_WEB_CLIENT_ID is not configured");
      return;
    }
    if (!authPrefs().getBoolean(PREF_EXCHANGE_PENDING, false)) {
      JSObject ret = new JSObject();
      ret.put("recovered", false);
      call.resolve(ret);
      return;
    }
    String deferredToken = authPrefs().getString(PREF_PENDING_ID_TOKEN, null);
    if (deferredToken != null && !deferredToken.trim().isEmpty()) {
      resolveDeferredTokenToCall(call);
      return;
    }
    logEvent("google_native_recover_started");
    googleSignInClient
      .silentSignIn()
      .addOnCompleteListener(task -> {
        try {
          GoogleSignInAccount account = task.getResult(ApiException.class);
          resolveAccountToCall(call, account, true);
        } catch (ApiException error) {
          logEvent("google_native_recover_failed " + error.getStatusCode() + " " + error.getMessage());
          call.reject("google_native_token_missing", error.getMessage());
        }
      });
  }

  @ActivityCallback
  private void googleSignInResult(PluginCall call, ActivityResult result) {
    if (call != null) {
      logEvent("google_native_result_bridge_call");
    }
    PluginCall activeCall = call != null ? call : pendingCall;
    pendingCall = null;

    boolean exchangePending = authPrefs().getBoolean(PREF_EXCHANGE_PENDING, false);
    GoogleSignInAccount account = resolveSignInAccountFromResult(result.getData());

    if (account != null && exchangePending) {
      if (activeCall != null) {
        resolveAccountToCall(activeCall, account, false);
      } else {
        saveDeferredSignInResult(account);
        logEvent("google_native_deferred_to_recover");
      }
      return;
    }

    if (activeCall == null) {
      logEvent("google_native_result_no_call");
      return;
    }

    if (result.getResultCode() == Activity.RESULT_CANCELED) {
      logEvent("google_native_cancelled");
      clearExchangePending();
      activeCall.reject("user_cancelled", "User cancelled Google sign in");
      return;
    }

    if (account != null) {
      resolveAccountToCall(activeCall, account, false);
      return;
    }

    logEvent("google_native_failed no_account");
    activeCall.reject("google_native_token_missing", "Google sign in did not return an account");
  }

  @PluginMethod
  public void signOut(PluginCall call) {
    clearExchangePending();
    if (googleSignInClient == null) {
      call.resolve();
      return;
    }
    googleSignInClient
      .signOut()
      .addOnCompleteListener(task -> {
        logEvent("google_native_signout_ok");
        call.resolve();
      });
  }
}
