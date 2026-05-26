"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** 주소 본문 앞 머리 핀 — 대표 / 일반 / 매장 동일 빨간 teardrop (주소 관리·마이페이지·시트 통일) */
export function AddressKindHeadPin(props: {
  kind: "master" | "store" | "general";
  className?: string;
  "aria-label"?: string;
}) {
  const { t } = useI18n();
  const { kind, className = "", "aria-label": ariaLabelOverride } = props;
  const aria =
    ariaLabelOverride ??
    (kind === "master" ? t("addr_ui_kind_master") : kind === "store" ? t("addr_ui_kind_store") : t("addr_ui_kind_general"));
  return (
    <span
      className={`inline-flex shrink-0 select-none text-[#E53935] ${className}`.trim()}
      role="img"
      aria-label={aria}
    >
      <svg
        className="h-[1.15rem] w-[0.95rem]"
        viewBox="0 0 24 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M12 0C5.37 0 0 5.2 0 11.62c0 8.12 12 20.38 12 20.38s12-12.26 12-20.38C24 5.2 18.63 0 12 0z"
          fill="currentColor"
        />
        <circle cx="12" cy="11" r="4.2" fill="white" />
      </svg>
    </span>
  );
}
