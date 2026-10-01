package com.dibay.app;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.auth.model.Prompt;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import com.kakao.sdk.user.UserApiClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.List;
import kotlin.Unit;

/**
 * DEBUG APK ONLY — isolated Kakao SDK method matrix (M1–M4).
 * Does NOT alter Production NativeKakaoAuthPlugin.signIn dispatch.
 *
 * Launch:
 *   adb shell am start -n com.dibay.app/.KakaoSdkMethodProbeActivity \
 *     --es method talk|account|account_login|account_select
 *
 * Logs tag: DIBAY_KAKAO_PROBE — Kakao User.id is SHA-256 hashed only; never logs tokens.
 */
public final class KakaoSdkMethodProbeActivity extends Activity {
  public static final String EXTRA_METHOD = "method";
  private static final String TAG = "DIBAY_KAKAO_PROBE";

  private TextView statusView;
  private String method = "unknown";
  private boolean finished;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    method = normalizeMethod(getIntent() != null ? getIntent().getStringExtra(EXTRA_METHOD) : null);

    ScrollView scroll = new ScrollView(this);
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    int pad = (int) (24 * getResources().getDisplayMetrics().density);
    root.setPadding(pad, pad, pad, pad);
    statusView = new TextView(this);
    statusView.setTextSize(16f);
    statusView.setText("QA probe\nmethod=" + method + "\nstarting…");
    root.addView(statusView);
    scroll.addView(root);
    setContentView(scroll);

    Log.i(TAG, "probe_start method=" + method);
    // Clear SDK token store only — does NOT log the user out of KakaoTalk app.
    UserApiClient.getInstance()
        .logout(
            error -> {
              Log.i(TAG, "sdk_logout_before_probe err=" + (error != null));
              runOnUiThread(this::invokeSelectedMethod);
              return Unit.INSTANCE;
            });
  }

  private static String normalizeMethod(String raw) {
    if (raw == null) return "unknown";
    String m = raw.trim().toLowerCase();
    if (m.equals("talk")
        || m.equals("m1")
        || m.equals("account")
        || m.equals("m2")
        || m.equals("account_login")
        || m.equals("m3")
        || m.equals("account_select")
        || m.equals("m4")) {
      return m.startsWith("m") ? mapMn(m) : m;
    }
    return "unknown";
  }

  private static String mapMn(String m) {
    switch (m) {
      case "m1":
        return "talk";
      case "m2":
        return "account";
      case "m3":
        return "account_login";
      case "m4":
        return "account_select";
      default:
        return "unknown";
    }
  }

  private void invokeSelectedMethod() {
    boolean talkAvailable = UserApiClient.getInstance().isKakaoTalkLoginAvailable(this);
    Log.i(TAG, "isKakaoTalkLoginAvailable=" + talkAvailable);
    setStatus("method=" + method + "\ntalkAvailable=" + talkAvailable + "\ninvoking…");

    switch (method) {
      case "talk":
        Log.i(TAG, "invoke=loginWithKakaoTalk");
        UserApiClient.getInstance().loginWithKakaoTalk(this, this::onLoginResult);
        break;
      case "account":
        Log.i(TAG, "invoke=loginWithKakaoAccount prompts=none");
        UserApiClient.getInstance().loginWithKakaoAccount(this, this::onLoginResult);
        break;
      case "account_login":
        {
          Log.i(TAG, "invoke=loginWithKakaoAccount prompts=[LOGIN]");
          List<Prompt> prompts = Collections.singletonList(Prompt.LOGIN);
          UserApiClient.getInstance().loginWithKakaoAccount(this, prompts, this::onLoginResult);
          break;
        }
      case "account_select":
        {
          Log.i(TAG, "invoke=loginWithKakaoAccount prompts=[SELECT_ACCOUNT]");
          List<Prompt> prompts = Collections.singletonList(Prompt.SELECT_ACCOUNT);
          UserApiClient.getInstance().loginWithKakaoAccount(this, prompts, this::onLoginResult);
          break;
        }
      default:
        finishProbe("FAIL", "unknown_method", null);
    }
  }

  private Unit onLoginResult(OAuthToken token, Throwable error) {
    if (finished) return Unit.INSTANCE;
    if (error != null) {
      if (isCancelled(error)) {
        finishProbe("CANCEL", errorMessage(error), null);
      } else {
        finishProbe("ERROR", errorMessage(error), null);
      }
      return Unit.INSTANCE;
    }
    if (token == null || token.getAccessToken() == null || token.getAccessToken().trim().isEmpty()) {
      finishProbe("ERROR", "token_missing", null);
      return Unit.INSTANCE;
    }
    // Never log access token. Resolve Kakao service user id then hash.
    UserApiClient.getInstance()
        .me(
            (user, meError) -> {
              if (meError != null) {
                finishProbe("ERROR", "me_failed:" + errorMessage(meError), null);
                return Unit.INSTANCE;
              }
              String kakaoId = user != null && user.getId() != null ? String.valueOf(user.getId()) : "";
              String hash = sha256Prefix(kakaoId);
              finishProbe("SUCCESS", "ok", hash);
              return Unit.INSTANCE;
            });
    return Unit.INSTANCE;
  }

  private void finishProbe(String result, String detail, String kakaoIdHash) {
    if (finished) return;
    finished = true;
    String line =
        "probe_result method="
            + method
            + " result="
            + result
            + " detail="
            + detail
            + " kakao_id_hash="
            + (kakaoIdHash != null ? kakaoIdHash : "-");
    Log.i(TAG, line);
    setStatus(line + "\n\n(close activity or press back)");
  }

  private void setStatus(String text) {
    if (statusView != null) {
      statusView.setText(text);
    }
  }

  private static boolean isCancelled(Throwable error) {
    if (error instanceof ClientError) {
      return ((ClientError) error).getReason() == ClientErrorCause.Cancelled;
    }
    String message = error != null ? String.valueOf(error.getMessage()) : "";
    return message.toLowerCase().contains("cancel");
  }

  private static String errorMessage(Throwable error) {
    if (error == null) return "null";
    if (error instanceof ClientError) {
      return "ClientError:" + ((ClientError) error).getReason().name();
    }
    String msg = error.getMessage();
    return msg != null ? msg.replace('\n', ' ') : error.getClass().getSimpleName();
  }

  private static String sha256Prefix(String value) {
    if (value == null || value.isEmpty()) return "-";
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      byte[] dig = md.digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder();
      for (int i = 0; i < 6; i++) {
        sb.append(String.format("%02x", dig[i]));
      }
      return sb.toString();
    } catch (Exception e) {
      return "hash_error";
    }
  }
}
