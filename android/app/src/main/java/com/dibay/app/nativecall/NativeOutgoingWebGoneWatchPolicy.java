package com.dibay.app.nativecall;

import java.util.Locale;

/**
 * 웹 화면(렌더러)이 죽은 동안의 네이티브 발신 감시 판정 — 순수 함수
 * (android-caller-stuck-after-remote-missed-design §12-2). iOS {@code NativeOutgoingTerminalWatch} 와 같은 상태 집합.
 */
public final class NativeOutgoingWebGoneWatchPolicy {
  public static final long FAST_WINDOW_MS = 35_000L;
  public static final long FAST_INTERVAL_MS = 1_000L;
  public static final long SLOW_INTERVAL_MS = 5_000L;
  public static final long MAX_DURATION_MS = 180_000L;
  public static final long RATE_LIMIT_RETRY_MS = 5_000L;

  public enum Kind {
    /** 다음 조회 예약 */
    CONTINUE,
    /** 서버 종료 상태 → 네이티브 종료 경로로 전달 */
    TERMINAL,
    /** 감시 종료(연결됨·통화 없음·시간 초과) */
    STOP
  }

  public static final class Decision {
    public final Kind kind;
    public final long delayMs;
    public final String reason;

    Decision(Kind kind, long delayMs, String reason) {
      this.kind = kind;
      this.delayMs = delayMs;
      this.reason = reason;
    }
  }

  private NativeOutgoingWebGoneWatchPolicy() {}

  public static boolean isTerminalStatus(String status) {
    String s = normalize(status);
    return "rejected".equals(s)
        || "cancelled".equals(s)
        || "canceled".equals(s)
        || "ended".equals(s)
        || "missed".equals(s)
        || "failed".equals(s);
  }

  /** 다음 조회까지 기다릴 시간 (경과 시간 기준). */
  public static long intervalFor(long elapsedMs) {
    return elapsedMs < FAST_WINDOW_MS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
  }

  /**
   * @param elapsedMs 감시 시작 후 경과
   * @param stillOutgoingEstablishing 이 기기의 네이티브 발신이 아직 연결 전인지
   * @param httpStatus 조회 응답 코드 (실패 0)
   * @param sessionStatus 서버 세션 상태 (없으면 null)
   */
  public static Decision decide(
      long elapsedMs, boolean stillOutgoingEstablishing, int httpStatus, String sessionStatus) {
    if (!stillOutgoingEstablishing) return new Decision(Kind.STOP, 0L, "not_establishing");
    String s = normalize(sessionStatus);
    if (httpStatus >= 200 && httpStatus < 300) {
      if ("active".equals(s)) return new Decision(Kind.STOP, 0L, "session_active");
      if (isTerminalStatus(s)) return new Decision(Kind.TERMINAL, 0L, "status_" + s);
    }
    if (elapsedMs >= MAX_DURATION_MS) return new Decision(Kind.STOP, 0L, "max_duration");
    if (httpStatus == 429) return new Decision(Kind.CONTINUE, RATE_LIMIT_RETRY_MS, "rate_limited");
    return new Decision(Kind.CONTINUE, intervalFor(elapsedMs), "pending");
  }

  private static String normalize(String status) {
    return status == null ? "" : status.trim().toLowerCase(Locale.ROOT);
  }
}
