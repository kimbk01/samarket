package com.dibay.app.nativecall;

import java.util.Locale;
import java.util.Set;

/**
 * 통화 종료 판단 단일 함수 (docs/audit/call-termination-authority-audit-2026-11-01.md §2-2).
 *
 * <p>Owner 규칙: 통화는 종료·거절·취소 버튼, 상대 종료(서버 확정), 정당한 결과(무응답·busy·복구 불가 실패)로만
 * 끝난다. 화면 파괴·대체·웹 미확인 요청·비치명 오류는 살아 있는 통화를 끝내지 않는다(KEEP).
 *
 * <p>「이미 끝난 세션」(NONE·TERMINAL)은 사유와 관계없이 항상 정리(CONVERGE)한다. 판단 함수가 정리를 막는 일은 없다.
 * 음성·영상 Runtime 은 종료 진입점마다 이 함수를 거친 뒤에만 서버 PATCH·정리를 한다.
 */
public final class CallTerminationPolicy {
  /** 종료 요청 사유(종류). 출처는 로그용 문자열로 따로 남긴다. */
  public enum Cause {
    /** 앱·알림·Dock·PiP 종료 버튼. */
    USER_END,
    /** 수신 거절 버튼. */
    USER_DECLINE,
    /** 발신 취소 버튼. */
    USER_CANCEL,
    /** 서버 상태로 확인된 상대 종료·취소·거절 (terminal 푸시·서버 조회·Agora 상대 퇴장). */
    PEER_TERMINAL,
    /** 서버가 확정한 무응답. */
    NO_ANSWER,
    /** 이 기기의 벨 30초 타이머 — 서버에 missed 를 보낸다. */
    NO_ANSWER_LOCAL_TIMER,
    /** 서버 busy. */
    BUSY,
    /** 토큰·참가·수락 실패, Agora 치명 오류. */
    MEDIA_FATAL,
    /** 발신에 필요한 권한이 없음. */
    PERMISSION_DENIED,
    /** 통화 화면 파괴·최근 앱 제거·PiP 닫기·Dock 정리. */
    SURFACE_LOST,
    /** 새 수신·새 발신이 기존 통화를 대체하려 함. */
    SUPERSEDED,
    /** 엔진 점유·consumed 기록 기반 정리. */
    RECLAIM,
    /** 웹이 보낸 서버 미확인 종료 요청 (정리·감시 타이머·조회 실패). */
    WEB_REQUEST_UNCONFIRMED,
    UNKNOWN
  }

  /** 판단 시점 세션 단계. */
  public enum Phase {
    /** Runtime 에 세션 없음. */
    NONE,
    /** 수신 벨. */
    RINGING,
    /** 수락 중·연결 중·발신 벨(발신자 CONNECTING). */
    ESTABLISHING,
    CONNECTED,
    /** ENDING·ENDED·FAILED. */
    TERMINAL
  }

  public enum Decision {
    /** 서버 PATCH(사용자·로컬 결과) 후 정리. */
    TERMINATE,
    /** 서버가 이미 확정(또는 이미 끝난 세션) — PATCH 없이 정리. */
    CONVERGE,
    /** 아무것도 바꾸지 않고 기록만 남김. */
    KEEP
  }

  /** 웹 endCall 사유 중 서버 상태에서 온 것(서버 확정 terminal). 그 외(failed 포함)는 미확인 요청. */
  private static final Set<String> WEB_SERVER_TERMINAL_REASONS =
      Set.of(
          "ended",
          "remote_ended",
          "call_ended",
          "cancelled",
          "canceled",
          "remote_cancelled",
          "call_cancelled",
          "call_canceled",
          "rejected",
          "declined",
          "remote_rejected",
          "call_rejected",
          "missed",
          "remote_missed",
          "call_missed",
          "no_answer",
          "busy",
          "peer_busy",
          "answered_elsewhere",
          "call_answered_elsewhere",
          "native_stale_terminal",
          "recovery_no_live_session");

  /**
   * Agora 치명 오류 코드 (io.agora.rtc2.Constants). 그 외 오류 코드는 기록만 하고 SDK 자동 재연결에 맡긴다.
   * 17 ERR_JOIN_CHANNEL_REJECTED · 101 ERR_INVALID_APP_ID · 102 ERR_INVALID_CHANNEL_NAME ·
   * 109 ERR_TOKEN_EXPIRED · 110 ERR_INVALID_TOKEN.
   */
  private static final Set<Integer> AGORA_FATAL_ERRORS = Set.of(17, 101, 102, 109, 110);

  /** Agora CONNECTION_STATE_FAILED — SDK 가 재연결을 포기한 상태(서버 차단·참가 실패·토큰 무효 포함). */
  public static final int AGORA_CONNECTION_STATE_FAILED = 5;

  private CallTerminationPolicy() {}

  public static Decision decide(Cause cause, Phase phase) {
    Cause c = cause != null ? cause : Cause.UNKNOWN;
    Phase p = phase != null ? phase : Phase.NONE;
    if (p == Phase.TERMINAL) return Decision.CONVERGE;
    switch (c) {
      case USER_END:
      case USER_DECLINE:
      case USER_CANCEL:
        // 세션이 없어도(프로세스 재시작 후 알림 버튼 등) 사용자 의사는 서버에 보낸다.
        return Decision.TERMINATE;
      case PEER_TERMINAL:
      case BUSY:
        return Decision.CONVERGE;
      case NO_ANSWER:
        return p == Phase.CONNECTED ? Decision.KEEP : Decision.CONVERGE;
      case NO_ANSWER_LOCAL_TIMER:
        if (p == Phase.RINGING) return Decision.TERMINATE;
        return p == Phase.NONE ? Decision.CONVERGE : Decision.KEEP;
      case MEDIA_FATAL:
        return p == Phase.NONE ? Decision.CONVERGE : Decision.TERMINATE;
      case PERMISSION_DENIED:
        if (p == Phase.RINGING || p == Phase.ESTABLISHING) return Decision.TERMINATE;
        return p == Phase.NONE ? Decision.CONVERGE : Decision.KEEP;
      case SURFACE_LOST:
      case SUPERSEDED:
      case RECLAIM:
      case WEB_REQUEST_UNCONFIRMED:
      case UNKNOWN:
      default:
        return p == Phase.NONE ? Decision.CONVERGE : Decision.KEEP;
    }
  }

  /** 서버·Agora 가 전달한 terminal 종류 → 사유. missed 는 무응답(연결됨이면 KEEP). */
  public static Cause causeForServerTerminalKind(String terminalKind) {
    String kind = normalize(terminalKind);
    if ("missed".equals(kind) || "call_missed".equals(kind) || "missed_call".equals(kind) || "no_answer".equals(kind)) {
      return Cause.NO_ANSWER;
    }
    if ("busy".equals(kind) || "peer_busy".equals(kind)) return Cause.BUSY;
    return Cause.PEER_TERMINAL;
  }

  /** 웹 endCall 사유 → 사유. 서버 상태에서 온 사유만 서버 확정으로 본다. */
  public static Cause causeForWebEndReason(String reason) {
    String r = normalize(reason);
    if (!WEB_SERVER_TERMINAL_REASONS.contains(r)) return Cause.WEB_REQUEST_UNCONFIRMED;
    return causeForServerTerminalKind(r);
  }

  public static boolean isAgoraFatalError(int err) {
    return AGORA_FATAL_ERRORS.contains(err);
  }

  public static boolean isAgoraFatalConnectionState(int state) {
    return state == AGORA_CONNECTION_STATE_FAILED;
  }

  private static String normalize(String value) {
    return value != null ? value.trim().toLowerCase(Locale.ROOT) : "";
  }
}
