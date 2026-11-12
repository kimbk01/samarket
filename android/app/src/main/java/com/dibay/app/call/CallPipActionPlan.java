package com.dibay.app.call;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * 통화 PiP 버튼 계획 — 음성·영상 공통 단일 규칙.
 *
 * <p>SSOT: {@code docs/dibay-call-minimized-surface-cta-ssot.md} §3 · §4. 레거시 기준(Telegram 실측 T4 ·
 * {@code CallPipActions}): 화면 순서는 항상 마이크 · 카메라 · 통화 종료. 시스템이 보여 주는 개수
 * ({@code getMaxNumPictureInPictureActions}, 휴대폰 3개)보다 많으면 우선순위가 낮은 것부터 뺀다 — 마이크 &gt; 켜진
 * 카메라 끄기 &gt; 통화 종료 &gt; 꺼진 카메라 켜기.
 *
 * <p>순수 자바(안드로이드 API 없음) — JVM 단위 테스트 대상. Presenter 는 이 결과만 RemoteAction 으로 바꾼다.
 */
public final class CallPipActionPlan {
  public enum Action {
    MIC,
    CAMERA,
    END
  }

  /** 화면 순서(왼→오). */
  public static final List<Action> DISPLAY_ORDER =
      Collections.unmodifiableList(java.util.Arrays.asList(Action.MIC, Action.CAMERA, Action.END));

  private static final int PRIORITY_MIC = 100;
  private static final int PRIORITY_CAMERA_ON = 90;
  private static final int PRIORITY_END = 80;
  private static final int PRIORITY_CAMERA_OFF = 60;

  private CallPipActionPlan() {}

  /**
   * @param video 영상 통화면 true (음성은 카메라 버튼 없음)
   * @param cameraEnabled 영상에서 내 카메라가 켜져 있으면 true
   * @param maxActions 시스템 최대 개수. 0 이하면 빈 목록
   */
  public static List<Action> plan(boolean video, boolean cameraEnabled, int maxActions) {
    if (maxActions <= 0) return Collections.emptyList();
    final List<Action> candidates = new ArrayList<>(3);
    candidates.add(Action.MIC);
    if (video) candidates.add(Action.CAMERA);
    candidates.add(Action.END);
    if (candidates.size() > maxActions) {
      final List<Action> byPriority = new ArrayList<>(candidates);
      Collections.sort(
          byPriority,
          new Comparator<Action>() {
            @Override
            public int compare(Action a, Action b) {
              return Integer.compare(priority(b, cameraEnabled), priority(a, cameraEnabled));
            }
          });
      while (byPriority.size() > maxActions) byPriority.remove(byPriority.size() - 1);
      candidates.retainAll(byPriority);
    }
    final List<Action> out = new ArrayList<>(candidates.size());
    for (Action action : DISPLAY_ORDER) {
      if (candidates.contains(action)) out.add(action);
    }
    return out;
  }

  private static int priority(Action action, boolean cameraEnabled) {
    switch (action) {
      case MIC:
        return PRIORITY_MIC;
      case CAMERA:
        return cameraEnabled ? PRIORITY_CAMERA_ON : PRIORITY_CAMERA_OFF;
      case END:
      default:
        return PRIORITY_END;
    }
  }

  /** 버튼 상태가 바뀔 때만 PiP 파라미터를 다시 넘기기 위한 키 (깜박임 방지 — Telegram actionsKey 방식). */
  public static String stateKey(
      List<Action> actions, boolean micMuted, boolean cameraEnabled, boolean autoEnter) {
    StringBuilder key = new StringBuilder();
    for (Action action : actions) key.append(action.name()).append('|');
    key.append("mic=").append(micMuted).append("|cam=").append(cameraEnabled);
    key.append("|auto=").append(autoEnter);
    return key.toString();
  }
}
