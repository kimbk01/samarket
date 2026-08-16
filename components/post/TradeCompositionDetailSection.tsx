"use client";

/**
 * Detail attribute section from Category Composition (no new skin if-trees).
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { applyTradeBehaviorAdapter } from "@/lib/trade/category-form/behavior-adapters";
import type { TradeBehaviorContext } from "@/lib/trade/category-form/behavior-adapters";
import { buildCompositionDetailAttributes } from "@/lib/trade/category-form/detail-attributes";
import { tradeFieldAdminLabel } from "@/lib/trade/category-form/field-admin-labels";
import { resolveTradeComposition } from "@/lib/trade/category-form/resolve-composition";
import { formatPrice } from "@/lib/utils/format";
import {
  TRADE_FB_DETAIL_META_DD,
  TRADE_FB_DETAIL_META_DT,
  TRADE_FB_DETAIL_META_ROW,
  TRADE_WRITE_FB_BLOCK_TITLE,
} from "@/lib/ui/trade-write-fb-ui";

function parseMetaAmount(raw: string): number {
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function TradeCompositionDetailSection(props: {
  iconKey: string;
  fieldComposition?: unknown;
  title: string;
  meta: Record<string, unknown>;
  post?: Record<string, unknown>;
  currency?: string;
  adapterCtx?: TradeBehaviorContext;
  skipFieldIds?: readonly string[];
  formatField?: (
    fieldId: string,
    rawValue: string,
    meta: Record<string, unknown>
  ) => string | null;
}) {
  const { language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const composition = resolveTradeComposition({
    icon_key: props.iconKey,
    fieldComposition: props.fieldComposition ?? null,
  });
  const adapted = applyTradeBehaviorAdapter(composition, props.adapterCtx ?? {});
  const attrs = buildCompositionDetailAttributes({
    composition,
    adaptedFields: adapted,
    meta: props.meta,
    post: props.post,
    lang,
    skipFieldIds: props.skipFieldIds,
    formatMoney: props.currency
      ? (raw) => formatPrice(parseMetaAmount(raw), props.currency!)
      : undefined,
    formatField: props.formatField,
  });
  if (attrs.length === 0) return null;
  return (
    <>
      <h3 className={TRADE_WRITE_FB_BLOCK_TITLE}>{props.title}</h3>
      <dl className="mt-2 space-y-2 text-[15px] leading-snug">
        {attrs.map((a) => (
          <div key={a.fieldId} className={TRADE_FB_DETAIL_META_ROW}>
            <dt className={TRADE_FB_DETAIL_META_DT}>
              {tradeFieldAdminLabel(a.fieldId, lang) || a.fieldId}
            </dt>
            <dd className={TRADE_FB_DETAIL_META_DD}>{a.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
