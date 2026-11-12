import {
  DIBAY_SERVICE_BRAND_ICON_PATH,
  DIBAY_SERVICE_BRAND_ICON_VIEWBOX,
  DIBAY_STOREFRONT_ICON_PATH,
  type DibayServiceBrandId,
} from "@/lib/brand/dibay-service-brand";

type ServiceBrandIconProps = {
  brand: DibayServiceBrandId;
  className?: string;
  /** 숫자면 width·height 속성. 보통은 className(CSS)으로 크기를 정한다. */
  size?: number;
};

/**
 * 서비스 대표 아이콘 — 단 하나의 그리는 곳 (`lib/brand/dibay-service-brand.ts`).
 * 채움 단색(`currentColor`) — 선 두께 없음.
 */
export function ServiceBrandIcon({ brand, className, size }: ServiceBrandIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={DIBAY_SERVICE_BRAND_ICON_VIEWBOX}
      fill="currentColor"
      aria-hidden
      data-service-brand-icon={brand}
    >
      <path d={DIBAY_SERVICE_BRAND_ICON_PATH[brand]} />
    </svg>
  );
}

/** 매장 사장님 운영(기능) — 브랜드 아님, 같은 채움 계열 */
export function StorefrontFillIcon({ className, size }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={DIBAY_SERVICE_BRAND_ICON_VIEWBOX}
      fill="currentColor"
      aria-hidden
    >
      <path d={DIBAY_STOREFRONT_ICON_PATH} />
    </svg>
  );
}

/** 선 아이콘(lucide) 자리에 그대로 끼우는 컴포넌트 — `strokeWidth` 등은 받기만 하고 쓰지 않는다(채움 아이콘). */
export type ServiceBrandIconSlotProps = {
  className?: string;
  strokeWidth?: number | string;
  "aria-hidden"?: boolean | "true" | "false";
};

const SLOT_CACHE = new Map<DibayServiceBrandId, (p: ServiceBrandIconSlotProps) => React.JSX.Element>();

export function serviceBrandIconSlot(brand: DibayServiceBrandId): (p: ServiceBrandIconSlotProps) => React.JSX.Element {
  const hit = SLOT_CACHE.get(brand);
  if (hit) return hit;
  function BrandSlotIcon({ className }: ServiceBrandIconSlotProps) {
    return <ServiceBrandIcon brand={brand} className={className} />;
  }
  BrandSlotIcon.displayName = `ServiceBrandIcon(${brand})`;
  SLOT_CACHE.set(brand, BrandSlotIcon);
  return BrandSlotIcon;
}
