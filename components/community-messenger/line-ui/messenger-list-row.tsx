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
};

/**
 * 채팅·친구 목록 공통 한 줄 레이아웃 (플랫, 하단 구분선은 부모에서 border-b).
 */
export function MessengerListRow({ avatar, children, trailing, className = "", trailingLayout = "top" }: Props) {
  const trailingWrap =
    trailingLayout === "center"
      ? "flex shrink-0 flex-col items-end justify-center gap-0.5 self-stretch"
      : "flex shrink-0 flex-col items-end justify-start gap-0.5 self-stretch pt-0.5";
  return (
    <div
      className={`flex min-h-[68px] max-h-[72px] items-center gap-3 px-3 ${className}`.trim()}
      data-cm-messenger-list-row
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center">{avatar}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">{children}</div>
      {trailing ? <div className={trailingWrap}>{trailing}</div> : null}
    </div>
  );
}
