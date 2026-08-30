"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { deliveryAdsAdminHubHref } from "@/lib/stores/advertising/delivery-ad-placement-language";
import type { PolicyCampaignCounts } from "@/lib/stores/advertising/delivery-ad-policy-campaign-counts";
import type { HomePaidPlacementPolicySummary } from "@/lib/stores/advertising/delivery-ad-home-placement-policy";
import { resolveHomePaidPlacementPolicySummary } from "@/lib/stores/advertising/delivery-ad-home-placement-policy";
import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";

function fmtTemplate(template: string, n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return template.replace("{n}", "—");
  return template.replace("{n}", String(n));
}

export function AdminDeliveryAdHomePolicyPanel({
  restShelfAdIntegration,
}: {
  restShelfAdIntegration: string | null | undefined;
}) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<HomePaidPlacementPolicySummary | null>(null);
  const [counts, setCounts] = useState<PolicyCampaignCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [compRes, adsRes] = await Promise.all([
          fetch("/api/admin/stores-composition-policy?surface=home", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(
            `/api/admin/delivery-ads?${new URLSearchParams({
              inventory: "STORES_HOME_FEED",
              bucket: "all",
              product: "store_sponsored",
              limit: "500",
            }).toString()}`,
            { credentials: "include", cache: "no-store" }
          ),
        ]);
        const compJson = (await compRes.json()) as {
          ok?: boolean;
          rows?: StoresCompositionSectionContract[];
        };
        const adsJson = (await adsRes.json()) as {
          ok?: boolean;
          policyCounts?: PolicyCampaignCounts | null;
        };
        if (cancelled) return;
        if (compRes.ok && compJson.ok && compJson.rows) {
          setSummary(
            resolveHomePaidPlacementPolicySummary({
              compositionRows: compJson.rows,
              restShelfAdIntegration,
            })
          );
        }
        if (adsRes.ok && adsJson.ok && adsJson.policyCounts) {
          setCounts(adsJson.policyCounts);
        }
      } catch {
        if (!cancelled) {
          setSummary(null);
          setCounts(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restShelfAdIntegration]);

  const hubHref = deliveryAdsAdminHubHref({ inventory: "STORES_HOME_FEED" });

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
      <p className="text-[13px] font-bold text-sam-fg">{t("admin_delivery_ads_home_policy_title")}</p>
      <p className="mt-1 text-[11px] text-sam-muted">{t("admin_delivery_ads_browse_policy_authority")}</p>
      {summary ? (
        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="text-sam-muted">{t("admin_delivery_ads_home_policy_enabled")}</dt>
            <dd className="font-semibold text-sam-fg">
              {summary.enabled
                ? t("admin_delivery_ads_home_policy_enabled_on")
                : t("admin_delivery_ads_home_policy_enabled_off")}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_delivery_ads_browse_policy_interval").split(":")[0]}</dt>
            <dd className="font-semibold text-sam-fg">
              {fmtTemplate(t("admin_delivery_ads_home_policy_interval"), summary.intervalEveryN)}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_delivery_ads_browse_policy_max")}</dt>
            <dd className="font-semibold text-sam-fg">
              {fmtTemplate(t("admin_delivery_ads_home_policy_max"), summary.max)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-[12px] text-sam-muted">{t("admin_delivery_ads_loading")}</p>
      )}
      {counts ? (
        <ul className="mt-3 flex flex-wrap gap-3 text-[12px] text-sam-fg">
          <li>
            {t("admin_delivery_ads_count_linked")}:{" "}
            <span className="font-semibold">{counts.linked}</span>
          </li>
          <li>
            {t("admin_delivery_ads_count_exposable")}:{" "}
            <span className="font-semibold">{counts.exposable_now}</span>
          </li>
          <li>
            {t("admin_delivery_ads_count_under_review")}:{" "}
            <span className="font-semibold">{counts.under_review}</span>
          </li>
        </ul>
      ) : null}
      <Link href={hubHref} className="mt-3 inline-block text-[13px] font-semibold text-signature underline">
        {t("admin_delivery_ads_open_campaigns")}
      </Link>
    </div>
  );
}

export function AdminDeliveryAdBrowsePolicyPanel({
  primarySlug,
  subSlug,
  adEnabled,
  maxInsertion,
  intervalEveryN,
}: {
  primarySlug: string;
  subSlug: string | null;
  adEnabled: boolean;
  maxInsertion: number | null;
  intervalEveryN: number;
}) {
  const { t } = useI18n();
  const [counts, setCounts] = useState<PolicyCampaignCounts | null>(null);

  useEffect(() => {
    if (!primarySlug.trim()) {
      setCounts(null);
      return;
    }
    let cancelled = false;
    const qs = new URLSearchParams({
      inventory: "STORES_CATEGORY_FEED",
      bucket: "all",
      product: "store_sponsored",
      primarySlug: primarySlug.trim(),
      limit: "500",
    });
    if (subSlug?.trim()) qs.set("subSlug", subSlug.trim());
    (async () => {
      try {
        const res = await fetch(`/api/admin/delivery-ads?${qs.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          policyCounts?: PolicyCampaignCounts | null;
        };
        if (cancelled) return;
        if (res.ok && json.ok && json.policyCounts) setCounts(json.policyCounts);
        else setCounts(null);
      } catch {
        if (!cancelled) setCounts(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primarySlug, subSlug]);

  const hubHref = deliveryAdsAdminHubHref({
    inventory: "STORES_CATEGORY_FEED",
    primarySlug,
    subSlug,
  });

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
      <p className="text-[13px] font-bold text-sam-fg">{t("admin_delivery_ads_browse_policy_title")}</p>
      <p className="mt-1 text-[11px] text-sam-muted">{t("admin_delivery_ads_browse_policy_authority")}</p>
      <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-sam-muted">{t("admin_delivery_ads_browse_policy_enabled")}</dt>
          <dd className="font-semibold text-sam-fg">
            {adEnabled
              ? t("admin_delivery_ads_home_policy_enabled_on")
              : t("admin_delivery_ads_home_policy_enabled_off")}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_delivery_ads_browse_policy_max")}</dt>
          <dd className="font-semibold text-sam-fg">
            {maxInsertion == null ? "—" : `${maxInsertion}`}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">
            {t("admin_delivery_ads_browse_policy_interval").split(":")[0]}
          </dt>
          <dd className="font-semibold text-sam-fg">
            {intervalEveryN > 0
              ? fmtTemplate(t("admin_delivery_ads_browse_policy_interval"), intervalEveryN)
              : "—"}
          </dd>
        </div>
      </dl>
      {counts ? (
        <ul className="mt-3 flex flex-wrap gap-3 text-[12px] text-sam-fg">
          <li>
            {t("admin_delivery_ads_count_linked")}:{" "}
            <span className="font-semibold">{counts.linked}</span>
          </li>
          <li>
            {t("admin_delivery_ads_count_exposable")}:{" "}
            <span className="font-semibold">{counts.exposable_now}</span>
          </li>
          <li>
            {t("admin_delivery_ads_count_under_review")}:{" "}
            <span className="font-semibold">{counts.under_review}</span>
          </li>
        </ul>
      ) : null}
      <Link href={hubHref} className="mt-3 inline-block text-[13px] font-semibold text-signature underline">
        {t("admin_delivery_ads_open_campaigns")}
      </Link>
    </div>
  );
}
