package com.dibay.app;

/**
 * C1 — OS 시작 화면 고장 판정 (docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C1 · Owner D1).
 *
 * <p>정상 해제 = 웹 성공 신호(DibayBootBridge.dismissSplash) — 그대로. 이 정책은 그 신호가 오지 않는 <b>고장</b>만 판정한다.
 *
 * <ul>
 *   <li>표시 시간을 정하는 타이머가 아니다: 정상 시작에서는 웹 신호가 먼저 와서 판정이 끝난다.
 *   <li>T_js: 문서 수신 완료 후 JS(React 마운트)가 이 시간 안에 시작하지 않으면 고장.
 *   <li>T_release: JS 시작 후 이 시간 안에 해제 신호가 없으면 고장.
 *   <li>시간은 앱이 보이는 동안만 센다(백그라운드 시간은 고장이 아니다).
 *   <li>고장 시 자동 재로드는 문서 묶음당 1회, 그다음은 오류 화면(수동 「다시 시도」)만 — 무한 자동 재시도 금지.
 * </ul>
 *
 * <p>값은 후보값(D1: 확정값 아님). C8 운영 계측(2026-11-08 Android 콜드 2회: React 시작 1.5s·5.3s, 해제 2.5s·8.2s) 기준
 * 정상 분포보다 충분히 크게 둔다.
 */
public final class DibayStartupFaultPolicy {
  public static final long T_JS_MS = 8_000L;
  public static final long T_RELEASE_MS = 15_000L;
  public static final int MAX_AUTO_RELOADS = 1;

  public enum Verdict {
    /** 아직 판정할 수 없음 — 계속 관찰. */
    WAIT,
    /** 해제됨 또는 관찰 대상 아님 — 관찰 종료. */
    DONE,
    /** 문서 완료 후 JS 미시작. */
    FAULT_NO_JS,
    /** JS 시작 후 해제 신호 없음. */
    FAULT_NOT_RELEASED
  }

  public enum FaultAction {
    RELOAD_ONCE,
    SHOW_ERROR
  }

  private DibayStartupFaultPolicy() {}

  /**
   * @param released 시작 화면 해제 완료(또는 요청됨)
   * @param visibleMsSinceDocFinished 문서 완료 후 앱이 보인 누적 시간
   * @param visibleMsSinceJsRunning JS 시작 확인 후 앱이 보인 누적 시간 (아직 미확인이면 음수)
   */
  public static Verdict judge(boolean released, long visibleMsSinceDocFinished, long visibleMsSinceJsRunning) {
    if (released) return Verdict.DONE;
    if (visibleMsSinceJsRunning >= 0) {
      return visibleMsSinceJsRunning >= T_RELEASE_MS ? Verdict.FAULT_NOT_RELEASED : Verdict.WAIT;
    }
    return visibleMsSinceDocFinished >= T_JS_MS ? Verdict.FAULT_NO_JS : Verdict.WAIT;
  }

  /**
   * @param autoReloadsUsed 이 시작(Activity)에서 이미 쓴 고장 자동 재로드 수
   * @param callRoute 통화 경로 문서인지 — 통화 규정상 통화 화면은 자동 재로드하지 않는다
   */
  public static FaultAction onFault(int autoReloadsUsed, boolean callRoute) {
    if (callRoute) return FaultAction.SHOW_ERROR;
    return autoReloadsUsed < MAX_AUTO_RELOADS ? FaultAction.RELOAD_ONCE : FaultAction.SHOW_ERROR;
  }

  /** 오류 화면·로그용 이유 문자열. HTTP 오류 문서(401/403/429 등)는 상태 코드를 남긴다. */
  public static String faultReason(Verdict verdict, int mainFrameHttpStatus) {
    if (mainFrameHttpStatus >= 400) return "HTTP_" + mainFrameHttpStatus;
    return verdict == Verdict.FAULT_NOT_RELEASED ? "WEB_NOT_RELEASED" : "WEB_NOT_READY";
  }

  /**
   * 통화 경로 — 주소의 경로 부분(쿼리·조각 제외)에 call 이 있으면 통화 경로로 본다. 웹 세션 관문
   * (`isSessionFreshnessGatedApiPath`)·iOS `startupFaultIsCallRoute` 와 같은 규칙(검토 2026-11-08: 플랫폼마다 달랐다).
   * 넓게 잡는 쪽이 안전하다 — 통화 경로로 잡히면 이번 변경 이전 동작(고장 판정 없음) 그대로다.
   */
  public static boolean isCallRouteUrl(String url) {
    if (url == null) return false;
    String path = url;
    int scheme = path.indexOf("://");
    if (scheme >= 0) {
      int slash = path.indexOf('/', scheme + 3);
      path = slash >= 0 ? path.substring(slash) : "/";
    }
    int cut = path.length();
    int q = path.indexOf('?');
    int h = path.indexOf('#');
    if (q >= 0) cut = Math.min(cut, q);
    if (h >= 0) cut = Math.min(cut, h);
    return path.substring(0, cut).toLowerCase(java.util.Locale.ROOT).contains("call");
  }

  /** SSL 오류가 주 문서 것인지 — 하위 리소스 SSL 오류로 화면 전체를 실패 처리하지 않는다. */
  public static boolean isSameDocumentUrl(String errorUrl, String mainFrameUrl) {
    if (errorUrl == null || mainFrameUrl == null) return false;
    return stripFragment(errorUrl).equals(stripFragment(mainFrameUrl));
  }

  private static String stripFragment(String url) {
    int hash = url.indexOf('#');
    return hash >= 0 ? url.substring(0, hash) : url;
  }
}
