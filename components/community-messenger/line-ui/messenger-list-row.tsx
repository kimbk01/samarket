import type { ReactNode } from "react";

type Props = {
  /** 48×48 권장 */
  avatar: ReactNode;
  /** 제목·미리보기 등 */
  children: ReactNode;
  /** 우측 시간·뱃지 열 */
  trailing?: ReactNode;
  /** 행 높이 — 기본 68~72px 밀도 */
  className?: string;
  /** 우측 열 정렬 (친구 즐겨찾기 버튼은 `justify-center`) */
  trailingLayout?: "top" | "center";
  /**
   * true: 세로 `items-center` — 48px 원·닉+상태(2행)·우측 열의 수직 중심을 맞춤(친구 리스트)
   * (채팅 목록은 기본 `max-h` 밀도 유지)
   */
  centerWithAvatar?: boolean;
};

/**
 * 채팅·친구 목록 공통 한 줄 레이아웃 (플랫, 하단 구분선은 부모에서 border-b).
 */
export function MessengerListRow({
  avatar,
  children,
  trailing,
  className = "",
  trailingLayout = "top",
  centerWithAvatar = false,
}: Props) {
  const trailingWrap =
    centerWithAvatar
      ? "flex shrink-0 self-center"
      : trailingLayout === "center"
        ? "flex shrink-0 flex-col items-end justify-center gap-0.5 self-stretch"
        : "flex shrink-0 flex-col items-end justify-start gap-0.5 self-stretch pt-0.5";
  /** 친구 행: 세 열(원·2행 텍스트·별)을 `items-center`로 같은 수직중심에 둔다. */
  const rootClass = centerWithAvatar
    ? `flex w-full min-h-0 items-center gap-3 px-3 py-1.5 ${className}`.trim()
    : `flex min-h-[68px] max-h-[72px] items-center gap-3 px-3 ${className}`.trim();
  const mainClass = centerWithAvatar
    ? "flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5"
    : "flex min-h-0 min-w-0 flex-1 flex-col justify-center self-stretch";
  const avatarCellClass = "flex h-12 w-12 shrink-0 items-center justify-center";
  return (
    <div className={rootClass} data-cm-messenger-list-row>
      <div className={avatarCellClass}>{avatar}</div>
      <div className={mainClass}>{children}</div>
      {trailing ? <div className={trailingWrap}>{trailing}</div> : null}
    </div>
  );
}
