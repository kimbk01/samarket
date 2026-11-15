package com.dibay.app.nativecall;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.dibay.app.DibayNativeLocale;
import com.dibay.app.IncomingCallUiCopy;
import com.dibay.app.R;

/**
 * 통화 화면 안 대기 띠 — 「OO · 대기 중인 전화 · 음성 통화 / 거절 / 종료 후 받기」.
 *
 * <p>대기 통화가 있는 동안 진행 중 통화 화면(음성·영상) 위쪽에 계속 보인다. 알림 heads-up 이 내려가도 통화 화면을 보는
 * 사람은 언제든 고를 수 있다(Google 전화·WhatsApp 형태). 상태는 {@link NativeCallWaitingPresenter} 만 가진다 — 이 띠는
 * 그리기만 하고, 버튼은 알림 버튼과 같은 처리(reject / endAndAccept)를 부른다.
 *
 * <p>실기 CW1 FAIL 수정 (Owner 「구현 승인」 2026-11-15) · docs/audit/call-waiting-device-verify-2026-11-15/README.md
 *
 * <p>보임 상태 보고: 통화 화면이 앞(resumed·PiP 아님)이면 이 띠가 유일한 선택지 표면이므로 presenter 에 알려 대기 알림을
 * 조용한 알림으로 바꾸게 한다(AOSP Dialer 와 같은 「표면 1개」). Activity 가 {@link #onHostResumed}·{@link #onHostPaused}
 * 를 부른다.
 */
public final class NativeCallWaitingBanner implements NativeCallWaitingPresenter.Listener {
  private static final int RADIUS_DP = 20;
  private static final int MARGIN_H_DP = 12;
  private static final int MARGIN_TOP_MIN_DP = 8;
  private static final int DANGER = 0xFFD93025;
  private static final int PRIMARY = 0xFF00754A;
  private static final int SURFACE = 0xF2202124;

  private final Activity activity;
  private final FrameLayout host;
  private View banner;
  private String shownCallId;
  private boolean hostResumed;

  private NativeCallWaitingBanner(Activity activity, FrameLayout host) {
    this.activity = activity;
    this.host = host;
  }

  /** 통화 화면 onCreate 에서 붙인다(setContentView 뒤). onDestroy 에서 {@link #detach()}. */
  public static NativeCallWaitingBanner attach(Activity activity) {
    if (activity == null) return null;
    View content = activity.findViewById(android.R.id.content);
    if (!(content instanceof ViewGroup)) return null;
    FrameLayout host = new FrameLayout(activity);
    host.setLayoutParams(
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    host.setClickable(false);
    host.setFocusable(false);
    ((ViewGroup) content).addView(host);
    NativeCallWaitingBanner view = new NativeCallWaitingBanner(activity, host);
    NativeCallWaitingPresenter.addListener(view);
    view.onCallWaitingChanged();
    return view;
  }

  public void detach() {
    NativeCallWaitingPresenter.removeListener(this);
    hostResumed = false;
    reportVisibility();
    remove();
  }

  /** 통화 Activity onResume. */
  public void onHostResumed() {
    hostResumed = true;
    reportVisibility();
    onCallWaitingChanged();
  }

  /** 통화 Activity onPause. */
  public void onHostPaused() {
    hostResumed = false;
    reportVisibility();
  }

  /** 통화 화면이 띠를 보일 수 있는 상태(앞에 있고 PiP 아님)인지 presenter 에 알린다. */
  private void reportVisibility() {
    NativeCallWaitingPresenter.setCallScreenVisible(activity, hostResumed && !isInPip());
  }

  private boolean isInPip() {
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode();
  }

  @Override
  public void onCallWaitingChanged() {
    if (activity.isFinishing()) return;
    reportVisibility();
    NativeCallWaitingPresenter.Snapshot snapshot = NativeCallWaitingPresenter.current();
    if (snapshot == null || isInPip()) {
      remove();
      return;
    }
    if (banner != null && snapshot.callId.equals(shownCallId)) return;
    remove();
    render(snapshot);
  }

  private void render(NativeCallWaitingPresenter.Snapshot snapshot) {
    LinearLayout box = new LinearLayout(activity);
    box.setOrientation(LinearLayout.VERTICAL);
    int pad = dp(14);
    box.setPadding(pad, pad, pad, dp(10));
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(SURFACE);
    bg.setCornerRadius(dp(RADIUS_DP));
    box.setBackground(bg);
    box.setElevation(dp(8));

    TextView name = new TextView(activity);
    name.setText(IncomingCallUiCopy.callerDisplayName(snapshot.callerName, null, null));
    name.setTextColor(Color.WHITE);
    name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
    name.setTypeface(Typeface.DEFAULT_BOLD);
    name.setSingleLine(true);
    box.addView(name);

    TextView kind = new TextView(activity);
    kind.setText(
        DibayNativeLocale.string(
            activity,
            "video".equals(snapshot.lane)
                ? R.string.dibay_call_waiting_text_video
                : R.string.dibay_call_waiting_text_voice));
    kind.setTextColor(0xCCFFFFFF);
    kind.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
    kind.setSingleLine(true);
    box.addView(kind);

    LinearLayout buttons = new LinearLayout(activity);
    buttons.setOrientation(LinearLayout.HORIZONTAL);
    LinearLayout.LayoutParams rowLp =
        new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    rowLp.topMargin = dp(10);
    buttons.setLayoutParams(rowLp);
    final String callId = snapshot.callId;
    buttons.addView(
        button(
            IncomingCallUiCopy.rejectLabel(activity),
            DANGER,
            v -> NativeCallWaitingPresenter.reject(activity, callId)),
        weighted(0, dp(6)));
    buttons.addView(
        button(
            DibayNativeLocale.string(activity, R.string.dibay_call_waiting_end_and_accept),
            PRIMARY,
            v -> NativeCallWaitingPresenter.endAndAccept(activity, callId)),
        weighted(dp(6), 0));
    box.addView(buttons);

    FrameLayout.LayoutParams lp =
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
    lp.setMargins(dp(MARGIN_H_DP), Math.max(dp(MARGIN_TOP_MIN_DP), topInset()), dp(MARGIN_H_DP), 0);
    host.addView(box, lp);
    banner = box;
    shownCallId = callId;
  }

  private TextView button(String label, int color, View.OnClickListener onClick) {
    TextView b = new TextView(activity);
    b.setText(label);
    b.setTextColor(Color.WHITE);
    b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    b.setTypeface(Typeface.DEFAULT_BOLD);
    b.setGravity(Gravity.CENTER);
    b.setMinHeight(dp(44));
    b.setSingleLine(true);
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(color);
    bg.setCornerRadius(dp(22));
    b.setBackground(bg);
    b.setClickable(true);
    b.setFocusable(true);
    b.setOnClickListener(onClick);
    return b;
  }

  private static LinearLayout.LayoutParams weighted(int left, int right) {
    LinearLayout.LayoutParams lp =
        new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    lp.leftMargin = left;
    lp.rightMargin = right;
    return lp;
  }

  private void remove() {
    if (banner != null) host.removeView(banner);
    banner = null;
    shownCallId = null;
  }

  private int topInset() {
    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(host);
    if (insets == null) return dp(MARGIN_TOP_MIN_DP);
    Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
    return bars.top + dp(MARGIN_TOP_MIN_DP);
  }

  private int dp(int value) {
    return Math.round(value * activity.getResources().getDisplayMetrics().density);
  }
}
