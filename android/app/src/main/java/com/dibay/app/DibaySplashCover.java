package com.dibay.app;

import android.app.Activity;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import java.lang.ref.WeakReference;

/**
 * 실기 FAIL-2 바로잡은 설계 F2′-a (Owner 「수정 설계 승인」 2026-11-17 ·
 * docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md §6).
 *
 * <p>원인(샤오미 시스템 추적): 시스템 시작 화면을 붙잡는 동안(setKeepOnScreenCondition) 앱 창은 한 번도 그려지지
 * 않고, 해제 직후 WebView 의 첫 실제 그리기(WebViewFunctor::drawVk)가 1.45초 걸려 그동안 창 바탕(흰색)만 보였다.
 * 해제를 늦춰도 이 비용은 해제 뒤에 치른다(빌드 68 실측).
 *
 * <p>수정: 아이콘 실행이면 시스템 시작 화면과 같은 모습(배경 {@code dibay_os_bg} · {@code ic_os_logo} 288dp 를 화면
 * 한가운데 — 시스템 시작 화면 실측 크기·위치)의 앱 안 덮개를 WebView 위에 둔다. 덮개가 붙으면 시스템 시작 화면을 바로
 * 넘기고(앱 창이 그려짐), WebView 는 덮개 아래에서 로드·첫 그리기를 끝낸다. 덮개는 시작 화면 해제 권한 두 가지
 * (웹 성공 신호 = 화면 커밋 뒤 · 네이티브 고장 판정)와 같은 때만 걷는다 — 표시 타이머 없음.
 * 대조 실측: 네이티브 인트로가 덮는 실행은 같은 방식으로 흰 프레임 0.
 *
 * <p>범위: 아이콘 실행만(인트로와 같은 판단 {@link MainActivity#isLauncherLaunch}) · 인트로를 고른 실행 제외(인트로가
 * 덮음) · 설정 변경으로 화면을 다시 만들 때 제외(시스템 시작 화면이 없음). 통화·알림·딥링크 실행은 지금 그대로.
 */
final class DibaySplashCover {
  private static final String TAG = "DibaySplashCover";
  /** 시스템 시작 화면 아이콘 칸 실측(삼성 450dpi·샤오미 213dpi 녹화에서 로고 보이는 부분 ≈ 127dp = 288dp × 420/960). */
  private static final int ICON_SLOT_DP = 288;

  /** 이번 화면 만들기에 덮개를 쓰기로 했는가 — super.onCreate(문서 시작 스크립트 설치) 전에 정한다. */
  private static volatile boolean planned = false;
  private static volatile boolean showing = false;
  /** 이 프로세스에서 MainActivity 를 한 번이라도 만들었는가 — 설정 변경 다시 만들기 구분. */
  private static boolean activityCreatedInProcess = false;
  private static WeakReference<View> viewRef = new WeakReference<>(null);

  private DibaySplashCover() {}

  /**
   * onCreate 맨 앞(인트로 고르기 뒤 · super.onCreate 전).
   *
   * <p>설정 변경 다시 만들기 = 같은 프로세스 + 저장 상태 있음. 프로세스가 죽은 뒤 복원(새 프로세스)은 시스템 시작 화면이
   * 뜨므로 덮개를 쓴다.
   */
  static void planForLaunch(boolean launcherLaunch, boolean introSelected, boolean hasSavedState) {
    boolean configRecreate = hasSavedState && activityCreatedInProcess;
    activityCreatedInProcess = true;
    planned = launcherLaunch && !introSelected && !configRecreate;
    showing = false;
    Log.i(
        TAG,
        "plan cover="
            + planned
            + " launcher="
            + launcherLaunch
            + " intro="
            + introSelected
            + " recreate="
            + configRecreate);
  }

  /** 웹 문서 시작 값 — 덮개를 쓰는 실행이면 "1" (웹은 P3 를 건너뛴다). */
  static String documentStartValue() {
    return planned ? "1" : "";
  }

  /** 시작 화면 유지 조건 — 덮개가 붙었으면 시스템 시작 화면을 바로 넘긴다. */
  static boolean isShowing() {
    return showing;
  }

  /** super.onCreate · 인트로 붙이기 뒤. 인트로가 붙었으면 덮지 않는다. */
  static void attach(Activity act) {
    if (!planned) return;
    if (DibayNativeIntro.isOverlayAttached()) {
      planned = false;
      return;
    }
    try {
      ViewGroup content = act.findViewById(android.R.id.content);
      if (content == null) {
        Log.w(TAG, "attach_skipped reason=no_content");
        return;
      }
      float dp = act.getResources().getDisplayMetrics().density;
      FrameLayout root = new FrameLayout(act);
      root.setBackgroundColor(act.getResources().getColor(R.color.dibay_os_bg, act.getTheme()));
      // 덮개 아래 WebView 를 누르지 못하게(시스템 시작 화면과 같음)
      root.setClickable(true);
      root.setElevation(10000f);
      root.setTranslationZ(10000f);
      root.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
      ImageView logo = new ImageView(act);
      logo.setImageResource(R.drawable.ic_os_logo);
      logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
      int slot = Math.round(ICON_SLOT_DP * dp);
      root.addView(logo, new FrameLayout.LayoutParams(slot, slot, Gravity.CENTER));
      content.addView(
          root,
          new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
      viewRef = new WeakReference<>(root);
      showing = true;
      Log.i(TAG, "show");
    } catch (Exception e) {
      showing = false;
      Log.w(TAG, "attach_failed reason=" + e.getClass().getSimpleName());
    }
  }

  /** 웹 해제(화면 커밋 뒤) · 고장 해제 · 화면 없어짐 — 1회. 메인 스레드에서 부른다. */
  static void hide(String source) {
    if (!showing) return;
    showing = false;
    View v = viewRef.get();
    viewRef = new WeakReference<>(null);
    if (v != null && v.getParent() instanceof ViewGroup) {
      ((ViewGroup) v.getParent()).removeView(v);
    }
    Log.i(TAG, "hide source=" + (source != null ? source : "unknown"));
  }
}
