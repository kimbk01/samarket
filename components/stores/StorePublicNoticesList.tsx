"use client";

type Props = {
  lines: string[];
  /** 루트 컨테이너에 붙는 클래스 (예: mt-3) */
  className?: string;
};

/**
 * 매장 창 공지 — `stores.business_hours_json.public_notices` (레거시 `promo_banner`는 파싱 시 병합).
 * 매장 관리 `OwnerStoreProfileForm`이 저장하고, 고객 화면은 이 컴포넌트만 쓰면 매장 메인·가게정보 등 동일 표시.
 */
export function StorePublicNoticesList({ lines, className = "" }: Props) {
  if (!lines.length) return null;
  return (
    <div className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>
      {lines.map((text, i) => (
        <div
          key={i}
          className="flex gap-2.5 rounded-ui-rect border border-sam-border bg-sam-app/90 px-3 py-3 sam-text-body-secondary leading-relaxed text-sam-fg"
        >
          <span className="shrink-0 sam-text-helper font-bold tracking-tight text-sam-muted">공지</span>
          <p className="min-w-0 flex-1 whitespace-pre-wrap">{text}</p>
        </div>
      ))}
    </div>
  );
}
