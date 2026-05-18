"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { MenuSection } from "@/lib/stores/group-store-products-by-menu";
import { estimateDeferredSectionHeightPx } from "@/lib/dibay/store-menu-viewport-policy";

export function DeferredMenuSectionPlaceholder({
  section,
  sectionIndex,
  sectionDomId,
  sectionScrollMarginCss,
}: {
  section: MenuSection;
  sectionIndex: number;
  sectionDomId?: (sectionIndex: number) => string;
  sectionScrollMarginCss?: string;
}) {
  const minHeight = estimateDeferredSectionHeightPx(section.items.length);

  return (
    <section
      id={sectionDomId ? sectionDomId(sectionIndex) : undefined}
      className="contain-layout"
      style={{
        minHeight,
        scrollMarginTop: sectionScrollMarginCss,
      }}
      aria-hidden
    >
      <div className={sectionIndex === 0 ? "pt-3.5" : "pt-4.5"}>
        <h3 className="text-[16px] font-extrabold tracking-[-0.02em] text-neutral-900">
          {section.listHeading ?? section.heading}
        </h3>
      </div>
      <div
        className="mt-2 rounded-[14px] bg-neutral-100/90"
        style={{ height: Math.max(48, minHeight - 56) }}
      />
    </section>
  );
}
