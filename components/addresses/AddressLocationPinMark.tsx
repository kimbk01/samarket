"use client";

import { useId } from "react";

/** 목록에서 ‘지정 이름 없음·위치만’ 행에 쓰는 빨간 지도 핀 마크 */
export function AddressLocationPinMark(props: { className?: string; "aria-label"?: string }) {
  const { className, "aria-label": ariaLabel } = props;
  const gid = useId().replace(/:/g, "");
  const gradId = `addrPinGrad-${gid}`;
  return (
    <svg
      className={className}
      viewBox="0 0 24 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
    >
      <path
        d="M12 0C5.37 0 0 5.2 0 11.62c0 8.12 12 20.38 12 20.38s12-12.26 12-20.38C24 5.2 18.63 0 12 0z"
        fill={`url(#${gradId})`}
      />
      <circle cx="12" cy="11" r="4.2" fill="white" />
      <defs>
        <linearGradient id={gradId} x1="6" y1="2" x2="18" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f87171" />
          <stop offset="1" stopColor="#dc2626" />
        </linearGradient>
      </defs>
    </svg>
  );
}
