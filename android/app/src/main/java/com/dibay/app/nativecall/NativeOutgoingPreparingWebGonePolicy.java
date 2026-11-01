package com.dibay.app.nativecall;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * 웹 화면(렌더러)이 서버 통화 id 를 넘기기 전에 죽은 발신 준비(PREPARING)의 처리 판정 — 순수 함수
 * (android-caller-stuck-after-remote-missed-design §14-1 C-M4).
 *
 * <p>웹이 죽었으므로 이 발신은 연결될 수 없다. 서버에 이미 만들어진 같은 방·본인 발신·울리는 중 통화가 보이면 취소해
 * 상대 벨을 멈추고 준비 화면을 닫는다. 정해진 시간 안에 보이지 않으면 준비 화면만 닫는다. 사용자가 준비 화면을 먼저
 * 닫았어도 남은 서버 통화는 취소하고, 그 사이 다시 걸었으면(다른 발신 존재) 손대지 않는다.
 */
public final class NativeOutgoingPreparingWebGonePolicy {
  /** 세션 생성 요청이 서버에 도달·완료될 때까지 기다리는 최대 시간. */
  public static final long WINDOW_MS = 15_000L;
  public static final long INTERVAL_MS = 1_000L;
  public static final long RATE_LIMIT_RETRY_MS = 3_000L;
  /** 기기·서버 시계 차이 허용 — 준비 시작보다 이만큼 이전에 시작된 통화는 이 발신이 아니다. */
  public static final long START_SKEW_MS = 30_000L;

  public enum Kind {
    CONTINUE,
    CANCEL_SESSION,
    CLOSE_ONLY,
    STOP
  }

  public static final class Decision {
    public final Kind kind;
    public final long delayMs;
    public final String reason;

    private Decision(Kind kind, long delayMs, String reason) {
      this.kind = kind;
      this.delayMs = delayMs;
      this.reason = reason;
    }

    static Decision of(Kind kind, long delayMs, String reason) {
      return new Decision(kind, delayMs, reason);
    }
  }

  private NativeOutgoingPreparingWebGonePolicy() {}

  /**
   * 서버 live 통화가 이 발신 준비의 통화인지 — 같은 방 · 본인 발신 · 울리는 중 · 준비 시작 이후(시계 차이 허용).
   *
   * @param sessionStartedAtMs 서버 startedAt(벽시계 ms). 읽지 못했으면 -1 (방·발신자·상태로만 판정).
   */
  public static boolean matches(
      String preparingRoomId,
      long preparingStartedAtWallMs,
      String sessionRoomId,
      boolean sessionIsMineInitiator,
      String sessionStatus,
      long sessionStartedAtMs) {
    if (preparingRoomId == null || preparingRoomId.trim().isEmpty()) return false;
    if (sessionRoomId == null || !preparingRoomId.trim().equals(sessionRoomId.trim())) return false;
    if (!sessionIsMineInitiator) return false;
    if (sessionStatus == null || !"ringing".equals(sessionStatus.trim().toLowerCase())) return false;
    if (sessionStartedAtMs >= 0 && sessionStartedAtMs < preparingStartedAtWallMs - START_SKEW_MS) {
      return false;
    }
    return true;
  }

  /**
   * @param stillPreparing 준비 화면이 아직 같은 attemptId 로 열려 있는지(사용자가 종료하면 false)
   * @param otherOutgoingLive 네이티브에 다른 발신(새 준비·연결 중 발신)이 있는지 — 있으면 다시 건 것이므로 손대지 않는다
   * @param httpStatus 조회 응답 코드(0 = 조회 안 함/네트워크 실패)
   * @param matched 조회한 세션이 {@link #matches} 를 만족하고 네이티브가 모르는 통화인지
   */
  public static Decision decide(
      long elapsedMs,
      boolean stillPreparing,
      boolean otherOutgoingLive,
      int httpStatus,
      boolean matched) {
    // 준비 화면이 닫히고 새 발신이 있으면 그 새 통화를 취소하면 안 된다(서버 새 발신이 이전 통화를 정리한다).
    if (!stillPreparing && otherOutgoingLive) return Decision.of(Kind.STOP, 0, "superseded");
    // 준비 화면을 사용자가 먼저 닫았어도(웹이 없어 서버 취소가 안 감) 남은 서버 통화는 취소해야 상대 벨이 멈춘다.
    if (matched) return Decision.of(Kind.CANCEL_SESSION, 0, "session_found");
    if (elapsedMs >= WINDOW_MS) {
      return stillPreparing
          ? Decision.of(Kind.CLOSE_ONLY, 0, "session_not_found")
          : Decision.of(Kind.STOP, 0, "session_not_found");
    }
    if (httpStatus == 401 || httpStatus == 403) {
      return stillPreparing
          ? Decision.of(Kind.CLOSE_ONLY, 0, "unauthorized")
          : Decision.of(Kind.STOP, 0, "unauthorized");
    }
    if (httpStatus == 429) return Decision.of(Kind.CONTINUE, RATE_LIMIT_RETRY_MS, "rate_limited");
    return Decision.of(Kind.CONTINUE, INTERVAL_MS, "waiting_session");
  }

  /** 서버 ISO 시각 → 벽시계 ms. 읽지 못하면 -1. (minSdk 24 — java.time 미사용) */
  public static long parseIsoMs(String iso) {
    if (iso == null) return -1;
    String v = iso.trim();
    if (v.isEmpty()) return -1;
    if (v.endsWith("Z")) v = v.substring(0, v.length() - 1) + "+00:00";
    v = v.replaceFirst("\\.\\d+", "");
    try {
      SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US);
      fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
      Date d = fmt.parse(v);
      return d != null ? d.getTime() : -1;
    } catch (Exception ignored) {
      return -1;
    }
  }
}
