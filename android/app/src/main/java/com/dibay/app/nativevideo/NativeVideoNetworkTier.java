package com.dibay.app.nativevideo;

/**
 * 영상 통화 신호 3단계 (Owner 2026-11-12 「좋음 · 나쁨 · 아주 나쁨」).
 *
 * <p>Agora {@code onNetworkQuality} 값(공식): 0 알 수 없음 · 1 아주 좋음 · 2 좋음 · 3 약간 손상 · 4 원활하지 않음 · 5 거의 불가 ·
 * 6 끊김 · 8 측정 중. 1·2 = 좋음, 3·4 = 나쁨, 5·6 = 아주 나쁨. 0·7·8 은 판정 값이 아니라 직전 단계를 그대로 둔다(예전에는 8 을
 * 「매우 나쁨」으로 오판).
 *
 * <p>바뀜 규칙(기존 유지): 나빠지면 즉시, 좋아지면 같은 쪽 값이 2번 연속 들어올 때.
 *
 * <p>Agora 연결 상태 4(재연결 중 — 연결이 끊겨 다시 붙는 중)는 품질 값과 상관없이 아주 나쁨. 연결 상태 3(연결됨)으로 돌아온 뒤
 * 품질 값으로 위 회복 규칙을 따른다. (실기 2026-11-12 22:28 PHT: Wi-Fi 끔 26초 동안 연결 상태 4 인데 표시는 「좋음」 그대로였던
 * 결함)
 *
 * <p>설계: docs/audit/call-video-chrome-signal-border-design-2026-11-12.md D3.
 */
final class NativeVideoNetworkTier {
  enum Tier {
    GOOD,
    POOR,
    VERY_POOR
  }

  static final int RECOVERY_SAMPLES = 2;
  static final int AGORA_STATE_CONNECTED = 3;
  static final int AGORA_STATE_RECONNECTING = 4;

  private Tier displayed = Tier.GOOD;
  private int recoveryCount;
  private boolean reconnecting;

  /** Agora 품질 값 1개 → 단계. 판정할 수 없는 값(0·7·8·범위 밖)은 null. */
  static Tier fromAgora(int quality) {
    if (quality == 1 || quality == 2) return Tier.GOOD;
    if (quality == 3 || quality == 4) return Tier.POOR;
    if (quality == 5 || quality == 6) return Tier.VERY_POOR;
    return null;
  }

  /** 송신·수신 값 중 판정 가능한 것 가운데 나쁜 쪽. 둘 다 판정 불가면 null. */
  static Tier worstOf(int txQuality, int rxQuality) {
    Tier tx = fromAgora(txQuality);
    Tier rx = fromAgora(rxQuality);
    if (tx == null) return rx;
    if (rx == null) return tx;
    return tx.ordinal() >= rx.ordinal() ? tx : rx;
  }

  Tier displayed() {
    return displayed;
  }

  boolean reconnecting() {
    return reconnecting;
  }

  void reset() {
    displayed = Tier.GOOD;
    recoveryCount = 0;
    reconnecting = false;
  }

  /** Agora 연결 상태 반영. 표시 단계가 바뀌면 true. */
  boolean onConnectionState(int state) {
    if (state == AGORA_STATE_RECONNECTING) {
      reconnecting = true;
      recoveryCount = 0;
      if (displayed == Tier.VERY_POOR) return false;
      displayed = Tier.VERY_POOR;
      return true;
    }
    if (state == AGORA_STATE_CONNECTED) {
      reconnecting = false;
      recoveryCount = 0;
    }
    return false;
  }

  /** 표본 1개 반영. 표시 단계가 바뀌면 true. */
  boolean onSample(int txQuality, int rxQuality) {
    Tier instant = worstOf(txQuality, rxQuality);
    if (instant == null) return false;
    if (reconnecting) return false; // 재연결 중에는 품질 값으로 좋아지지 않는다
    if (instant.ordinal() > displayed.ordinal()) {
      displayed = instant;
      recoveryCount = 0;
      return true;
    }
    if (instant.ordinal() < displayed.ordinal()) {
      recoveryCount++;
      if (recoveryCount >= RECOVERY_SAMPLES) {
        displayed = instant;
        recoveryCount = 0;
        return true;
      }
      return false;
    }
    recoveryCount = 0;
    return false;
  }
}
