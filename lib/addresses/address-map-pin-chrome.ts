/** 주소·지도 UI 핀 색 — `app/samarket-components.css` `--fab-palette-gold` 와 동일 */
export const ADDRESS_MAP_PIN_FILL = "#eac784";

/** Maps PinElement 테두리·대비용 (fill 보다 한 단계 진한 톤) */
export const ADDRESS_MAP_PIN_BORDER = "#c4a060";

/** Tailwind `text-[…]` — `AddressKindHeadPin` 등 teardrop SVG */
export const ADDRESS_MAP_PIN_TEXT_CLASS = "text-[#eac784]" as const;

/** Google Maps `PinElement` (Advanced Marker) */
export const ADDRESS_MAP_GOOGLE_PIN_ELEMENT = {
  background: ADDRESS_MAP_PIN_FILL,
  borderColor: ADDRESS_MAP_PIN_BORDER,
  glyphColor: "#FFFFFF",
} as const;

function addressMapPinSvgDataUrl(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32">` +
    `<path d="M12 0C5.37 0 0 5.2 0 11.62c0 8.12 12 20.38 12 20.38s12-12.26 12-20.38C24 5.2 18.63 0 12 0z" fill="${ADDRESS_MAP_PIN_FILL}"/>` +
    `<circle cx="12" cy="11" r="4.2" fill="white"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** 레거시 `google.maps.Marker` — 주소 미리보기·핀 미세조정 */
export function addressMapPinMarkerIcon(
  maps: typeof google.maps,
  size: { w: number; h: number } = { w: 28, h: 37 },
): google.maps.Icon {
  return {
    url: addressMapPinSvgDataUrl(),
    scaledSize: new maps.Size(size.w, size.h),
    anchor: new maps.Point(size.w / 2, size.h),
  };
}
