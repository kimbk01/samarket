export type MessengerTypingLabelKey =
  | "cm_typing_direct"
  | "cm_typing_one"
  | "cm_typing_two"
  | "cm_typing_many"
  | "cm_typing_count";

export type MessengerTypingLabelT = (
  key: MessengerTypingLabelKey,
  vars?: Record<string, string | number>
) => string;

/**
 * 입력 중 문구 단일 정의 (P3 · Owner 2026-11-18 레거시 Telegram 기준 = `docs/group-chat-presence-typing.md §3`).
 * - 1:1: 「입력 중」
 * - 그룹 1명: 「{name} 입력 중」 · 2명: 「{name1}, {name2} 입력 중」 · 3명+: 「{name1}, {name2} 외 {count}명 입력 중」
 * - 표시할 이름을 못 찾으면: 「{count}명 입력 중」
 * - 「…」 없음 — 뒤에 점 애니메이션(`TypingIndicatorLine`).
 * 인원 상한 없음.
 */
export function resolveMessengerTypingLabel(args: {
  roomType: string;
  typingUserIds: readonly string[];
  nameOf: (userId: string) => string | null | undefined;
  t: MessengerTypingLabelT;
}): string | null {
  const ids = args.typingUserIds;
  if (ids.length === 0) return null;
  if (args.roomType === "direct") return args.t("cm_typing_direct");
  const shown = ids.slice(0, 2).map((id) => (args.nameOf(id) ?? "").trim());
  if (shown.some((n) => !n)) return args.t("cm_typing_count", { count: ids.length });
  if (ids.length === 1) return args.t("cm_typing_one", { name: shown[0]! });
  if (ids.length === 2) return args.t("cm_typing_two", { name1: shown[0]!, name2: shown[1]! });
  return args.t("cm_typing_many", { name1: shown[0]!, name2: shown[1]!, count: ids.length - 2 });
}
