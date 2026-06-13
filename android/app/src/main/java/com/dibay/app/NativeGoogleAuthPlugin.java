package com.dibay.app;

import android.app.Activity;
import android.content.Intent;
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
import com.google.android.gms.tasks.Task;

/**
 * Google Native Login — Google Sign-In SDK (id_token).
 * Chrome / Custom Tab OAuth 금지 — Android 앱 전용.
 */
@CapacitorPlugin(name = "NativeGoogleAuth")
public class NativeGoogleAuthPlugin extends Plugin {

  private static final String TAG = "DIBAY_Google";

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

  @Override
  protected void handleOnDestroy() {
    rejectPendingCall("google_native_unavailable", "Activity destroyed during Google sign-in");
    super.handleOnDestroy();
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
    logEvent("google_native_started");
    Intent signInIntent = googleSignInClient.getSignInIntent();
    startActivityForResult(call, signInIntent, "googleSignInResult");
  }

  @ActivityCallback
  private void googleSignInResult(PluginCall call, ActivityResult result) {
    PluginCall activeCall = pendingCall != null ? pendingCall : call;
    pendingCall = null;
    if (activeCall == null) {
      return;
    }
    if (result.getResultCode() == Activity.RESULT_CANCELED) {
      logEvent("google_native_cancelled");
      activeCall.reject("user_cancelled", "User cancelled Google sign in");
      return;
    }

    Intent data = result.getData();
    Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
    try {
      GoogleSignInAccount account = task.getResult(ApiException.class);
      String idToken = account.getIdToken();
      if (idToken == null || idToken.trim().isEmpty()) {
        logEvent("google_native_token_missing");
        activeCall.reject("google_native_token_missing", "Google id token is missing");
        return;
      }
      logEvent("google_native_success");
      JSObject ret = new JSObject();
      ret.put("provider", "google");
      ret.put("idToken", idToken);
      if (account.getId() != null) {
        ret.put("userId", account.getId());
      }
      if (account.getEmail() != null) {
        ret.put("email", account.getEmail());
      }
      activeCall.resolve(ret);
    } catch (ApiException error) {
      if (error.getStatusCode() == 12501) {
        logEvent("google_native_cancelled");
        activeCall.reject("user_cancelled", error.getMessage());
        return;
      }
      logEvent("google_native_failed " + error.getStatusCode() + " " + error.getMessage());
      activeCall.reject("google_native_config_error", error.getMessage());
    }
  }

  @PluginMethod
  public void signOut(PluginCall call) {
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
