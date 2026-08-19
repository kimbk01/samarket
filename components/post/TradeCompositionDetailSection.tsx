"use client";

/**
 * Single DETAIL spec projector. Formatters + skip defaults live here — not MetaBlock if-trees.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatJobsCompositionDetailField } from "@/lib/jobs/job-detail-composition-rows";
import { applyTradeBehaviorAdapter } from "@/lib/trade/category-form/behavior-adapters";
import type { TradeBehaviorContext } from "@/lib/trade/category-form/behavior-adapters";
import { resolveTradeCompositionProfileId } from "@/lib/trade/category-form/composition-seeds";
import { buildCompositionDetailAttributes } from "@/lib/trade/category-form/detail-attributes";
import { formatCompositionDetailField } from "@/lib/trade/category-form/detail-field-formatters";
import {
  behaviorContextFromDetailMeta,
  defaultDetailSkipFieldIds,
} from "@/lib/trade/category-form/detail-spec-route";
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
  categorySlug?: string | null;
  fieldComposition?: unknown;
  title: string;
  meta: Record<string, unknown>;
  post?: Record<string, unknown>;
  currency?: string;
  adapterCtx?: TradeBehaviorContext;
  skipFieldIds?: readonly string[];
  /** Real-estate: spec table after location, before description */
  framed?: boolean;
  formatField?: (
    fieldId: string,
    rawValue: string,
    meta: Record<string, unknown>
  ) => string | null;
}) {
  const { t, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const profileId =
    resolveTradeCompositionProfileId({
      icon_key: props.iconKey,
      slug: props.categorySlug ?? null,
    }) ?? "general";
  const adapterCtx: TradeBehaviorContext = {
    ...behaviorContextFromDetailMeta(props.meta),
    ...props.adapterCtx,
  };
  const skipFieldIds = Array.from(
    new Set([...defaultDetailSkipFieldIds(profileId, props.meta), ...(props.skipFieldIds ?? [])])
  );
  const amount = typeof props.post?.price === "number" ? props.post.price : null;
  const formatField =
    props.formatField ??
    ((fieldId: string, rawValue: string, meta: Record<string, unknown>) => {
      if (profileId === "jobs") {
        return formatJobsCompositionDetailField({
          fieldId,
          rawValue,
          meta,
          listingKind: String(adapterCtx.listingKind ?? ""),
          lang,
        });
      }
      return formatCompositionDetailField(profileId, fieldId, rawValue, meta, {
        t,
        lang,
        amount,
      });
    });
  const composition = resolveTradeComposition({
    icon_key: props.iconKey,
    slug: props.categorySlug ?? null,
    fieldComposition: props.fieldComposition ?? null,
  });
  const adapted = applyTradeBehaviorAdapter(composition, adapterCtx);
  const attrs = buildCompositionDetailAttributes({
    composition,
    adaptedFields: adapted,
    meta: props.meta,
    post: props.post,
    lang,
    skipFieldIds,
    formatMoney: props.currency
      ? (raw) => formatPrice(parseMetaAmount(raw), props.currency!)
      : undefined,
    formatField,
  });
  if (attrs.length === 0) return null;
  const body = (
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
  if (props.framed) {
    return <div className="mt-3 border-t border-sam-border-soft pt-3">{body}</div>;
  }
  return body;
}
