"use client";

import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { TradeChatComposePreviewFields } from "@/lib/chats/trade-chat-compose-preview-client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const COL = `mx-auto w-full min-w-0 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`;

/**
 * roomId 확정 전 — 스피너만이 아닌 거래 채팅형 shell (상품 메타 + 비활성 입력·CTA).
 */
export function TradeChatComposePreparingShell({
  preview,
  errorBanner,
}: {
  preview: TradeChatComposePreviewFields | null;
  errorBanner?: { message: string; onRetry: () => void } | null;
}) {
  const { t } = useI18n();
  const title = preview?.productTitle?.trim() || t("chats_compose_fallback_product");
  const price = preview?.priceText?.trim() || t("chats_compose_fallback_price");
  const seller = preview?.sellerName?.trim() || t("chats_compose_fallback_seller");
  const thumb = preview?.productThumbnail?.trim() ?? "";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sam-app" aria-busy="true" aria-live="polite">
      <header className="border-b border-sam-border-soft bg-sam-surface px-4 py-3">
        <div className={`${COL} flex items-start gap-3`}>
          <SamarketThumbnail
            src={thumb}
            size={56}
            roundedClassName="rounded-ui-rect"
            className="bg-sam-surface-muted"
            fallbackSrc=""
            fallbackNode={<span className="text-[10px] font-medium text-sam-muted">IMG</span>}
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-sam-fg">{title}</p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-sam-fg">{price}</p>
            <p className="mt-1 text-[12px] text-sam-muted">{seller}</p>
          </div>
        </div>
      </header>

      {errorBanner ? (
        <div
          className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-center"
          role="alert"
        >
          <p className="text-[13px] text-red-800">{errorBanner.message}</p>
          <button
            type="button"
            onClick={errorBanner.onRetry}
            className="mt-2 text-[13px] font-semibold text-red-700 underline underline-offset-2"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col justify-between bg-sam-app">
        <div className={`${COL} flex flex-1 flex-col px-4 py-6`}>
          <p className="text-center text-[14px] font-medium text-sam-fg">{t("chats_compose_preparing_title")}</p>
          <p className="mt-2 text-center text-[12px] text-sam-muted">{t("chats_compose_preparing_description")}</p>
        </div>

        <footer className="border-t border-sam-border-soft bg-sam-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className={`${COL} flex flex-col gap-2`}>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 shrink-0 rounded-full bg-sam-surface-muted" aria-hidden />
              <div
                className={`h-11 min-w-0 flex-1 rounded-full border border-sam-border-soft bg-sam-app px-4 ${Sam.input.base}`}
                aria-hidden
              >
                <div className="flex h-full items-center">
                  <span className="text-[13px] text-sam-muted">{t("chats_compose_input_placeholder")}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="w-full rounded-ui-rect bg-sam-surface-muted py-3 text-[15px] font-semibold text-sam-muted"
            >
              {t("chats_compose_send_button")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
