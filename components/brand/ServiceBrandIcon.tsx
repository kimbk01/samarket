import {
  DIBAY_SERVICE_BRAND_ICON_OUTLINE_PATH,
  DIBAY_SERVICE_BRAND_ICON_PATH,
  DIBAY_SERVICE_BRAND_ICON_VIEWBOX,
  type DibayServiceBrandId,
} from "@/lib/brand/dibay-service-brand";

type ServiceBrandIconProps = {
  brand: DibayServiceBrandId;
  className?: string;
  /** 숫자면 width·height 속성. 보통은 className(CSS)으로 크기를 정한다. */
  size?: number;
  /** 기본 채움. 하단 탭 비선택만 외곽선(Owner 2026-11-15 「네이버형 채움↔외곽선」). */
  variant?: "fill" | "outline";
};

/**
 * 서비스 대표 아이콘 — 단 하나의 그리는 곳 (`lib/brand/dibay-service-brand.ts`).
 * 채움 단색(`currentColor`) — 선 두께 없음.
 */
export function ServiceBrandIcon({ brand, className, size, variant = "fill" }: ServiceBrandIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={DIBAY_SERVICE_BRAND_ICON_VIEWBOX}
      fill="currentColor"
      aria-hidden
      data-service-brand-icon={brand}
      data-service-brand-icon-variant={variant}
    >
      <path d={variant === "outline" ? DIBAY_SERVICE_BRAND_ICON_OUTLINE_PATH[brand] : DIBAY_SERVICE_BRAND_ICON_PATH[brand]} />
    </svg>
  );
}

/**
 * 아이콘 컴포넌트 자리(하단 탭 레지스트리·HOME 카드·알림함 등 lucide 와 섞인 표)에 끼우는 브랜드 아이콘.
 * 이 파일의 `ServiceBrandIcon` 하나만 그린다. `strokeWidth` 는 lucide 와 같은 표에 넣기 위한 타입 자리이고 채움 아이콘이라 쓰지 않는다.
 */
export type ServiceBrandIconSlotProps = {
  className?: string;
  variant?: "fill" | "outline";
  strokeWidth?: number | string;
  "aria-hidden"?: boolean | "true" | "false";
};

const SLOT_CACHE = new Map<DibayServiceBrandId, (p: ServiceBrandIconSlotProps) => React.JSX.Element>();

export function serviceBrandIconSlot(brand: DibayServiceBrandId): (p: ServiceBrandIconSlotProps) => React.JSX.Element {
  const hit = SLOT_CACHE.get(brand);
  if (hit) return hit;
  function BrandSlotIcon({ className, variant }: ServiceBrandIconSlotProps) {
    return <ServiceBrandIcon brand={brand} className={className} variant={variant} />;
  }
  BrandSlotIcon.displayName = `ServiceBrandIcon(${brand})`;
  SLOT_CACHE.set(brand, BrandSlotIcon);
  return BrandSlotIcon;
}
