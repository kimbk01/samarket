"use client";

import {
  APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS,
  APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS,
} from "@/lib/ui/app-content-layout";
import { STORE_CART_PAGE_TITLE } from "@/lib/stores/store-cart-policy";
import { BAEMIN_CART_TYPE } from "@/lib/stores/store-baemin-cart-ui";

export function StoreBaeminCartTopBar({ onBack }: { onBack: () => void }) {
  return (
    <header className={APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS}>
      <div className="w-full border-b border-[var(--delivery-border-section)] bg-white">
        <div className={APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS}>
          <div className="relative flex h-12 items-center">
            <button
              type="button"
              onClick={onBack}
              aria-label={"\ub4a4\ub85c\uac00\uae30"}
              className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#111] active:bg-black/[0.04]"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h1 className={`mx-auto text-center text-[#111111] ${BAEMIN_CART_TYPE.pageTitle}`}>
              {STORE_CART_PAGE_TITLE}
            </h1>
            <button
              type="button"
              aria-label={"\uce5c\uad6c \ucd94\uac00"}
              className="pointer-events-none absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#111] opacity-40"
              disabled
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 8v6M23 11h-6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
