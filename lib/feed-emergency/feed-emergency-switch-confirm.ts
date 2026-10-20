/**
 * 설계 v4 U-9 — 피드 긴급 스위치(킬스위치·Fallback·섹션 강제 비활성) 확인 문구.
 * 운영 앱 피드에 즉시 반영되는 L3 조작이라 위험(danger) 톤 + 목표 상태 단어 재입력으로 확인한다.
 * (클라이언트 안전 — 순수 함수)
 */

export type FeedEmergencySwitchKind = "kill_switch" | "fallback" | "section";

export type FeedEmergencySwitchConfirmCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "danger";
  /** 관리자가 그대로 다시 입력해야 하는 목표 상태 단어 (「차단」/「전환」/「비활성화」/「해제」). */
  confirmMatchText: string;
};

export function feedEmergencySwitchConfirmCopy(input: {
  kind: FeedEmergencySwitchKind;
  /** true = 스위치를 켠다(차단·전환·비활성화), false = 해제 */
  enable: boolean;
  /** 대상 이름 (예: 「홈」, 「홈 · 추천 섹션」) */
  targetLabel: string;
}): FeedEmergencySwitchConfirmCopy {
  const target = input.targetLabel.trim() || "-";
  const word = !input.enable
    ? "해제"
    : input.kind === "kill_switch"
      ? "차단"
      : input.kind === "fallback"
        ? "전환"
        : "비활성화";
  const subject =
    input.kind === "kill_switch"
      ? "피드 킬스위치"
      : input.kind === "fallback"
        ? "피드 Fallback"
        : "피드 섹션 강제 비활성";
  const effect = !input.enable
    ? "정상 피드로 돌아갑니다."
    : input.kind === "kill_switch"
      ? "추천 피드가 즉시 차단됩니다."
      : input.kind === "fallback"
        ? "Fallback 피드로 즉시 전환됩니다."
        : "이 섹션이 즉시 숨겨집니다.";
  return {
    title: `${subject} ${word}`,
    description: `대상: 「${target}」 · ${subject} → ${word}. 저장 즉시 실제 앱에 반영되어 ${effect}`,
    confirmLabel: word,
    cancelLabel: "취소",
    tone: "danger",
    confirmMatchText: word,
  };
}
