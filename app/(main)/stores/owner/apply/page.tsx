"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import {
  BusinessApplyForm,
  type BusinessApplyFormValues,
  type BusinessApplyProfileSeed,
} from "@/components/business/BusinessApplyForm";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { decodeProfileAppLocationPair } from "@/lib/profile/profile-location";
import { parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  StoresOwnerApplyHeaderChrome,
  STORES_OWNER_APPLY_HEADER_BODY_OFFSET_CLASS,
} from "@/components/stores/home/hub/StoresOwnerApplyHeaderChrome";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { STORES_OWNER_APPLY_HEADER_FIRST_SECTION_GAP_CLASS } from "@/lib/design/stores-home-header-chrome";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
import {
  getBrowsePrimaryBySlug,
  getBrowseSubIndustry,
} from "@/lib/stores/browse-taxonomy-seed-queries";
import { refreshOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import { formatStoreApprovalStatusI18n } from "@/lib/stores/store-approval-label-ko";

const HAS_ANY_STORE = true;

export default function BusinessApplyRoute() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "/stores/owner/apply";
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profileSeed, setProfileSeed] = useState<BusinessApplyProfileSeed | null>(null);
  const [existingStore, setExistingStore] = useState<any | null>(null);
  const [existingLoading, setExistingLoading] = useState(true);
  const [computedStoreSlug, setComputedStoreSlug] = useState<string>("");

  useEffect(() => {
    void requireAuthAction("owner_dashboard", () => {}, { next: pathname });
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await getMyProfile();
      if (cancelled) return;
      if (!p) {
        setProfileSeed(null);
        return;
      }
      const loc = decodeProfileAppLocationPair(p.region_code, p.region_name);
      const uname = String(p.username ?? "").trim().replace(/^@+/, "");
      setProfileSeed({
        applicantNickname: (p.nickname ?? "").trim(),
        phoneDigits: parsePhMobileInput(p.phone ?? ""),
        regionId: loc.regionId,
        cityId: loc.cityId,
        addressStreetLine: (p.address_street_line ?? "").trim(),
        addressDetail: (p.address_detail ?? "").trim(),
        profileBio: (p.bio ?? "").trim(),
        username: uname,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setExistingLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/me/stores", { credentials: "include", cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; stores?: any[] };
        if (cancelled) return;
        const stores = Array.isArray(j.stores) ? j.stores : [];
        // 정책: 1회 신청만 허용 → 내 매장이 하나라도 있으면 추가 신청 차단
        setExistingStore((HAS_ANY_STORE && stores.length > 0 ? stores[0] : null) ?? null);
        const uname = String(profileSeed?.username ?? "").trim().replace(/^@+/, "");
        const base = uname
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
          .replace(/-+/g, "-")
          .replace(/^-+|-+$/g, "");
        setComputedStoreSlug(base || "");
      } catch {
        if (!cancelled) setExistingStore(null);
      } finally {
        if (!cancelled) setExistingLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileSeed?.username]);

  const handleSubmit = async (values: BusinessApplyFormValues) => {
    setSubmitError(null);
    const nick = (profileSeed?.applicantNickname ?? values.applicantNickname).trim();
    if (!nick || nick.length > 20) {
      setSubmitError(t("business_phase7_680"));
      return;
    }
    const phoneRes = normalizeOptionalPhMobileDb(values.phone);
    if (!phoneRes.ok) {
      setSubmitError(t("phone_rule"));
      return;
    }
    const primaryMeta = getBrowsePrimaryBySlug(values.categoryPrimarySlug);
    const subMeta = getBrowseSubIndustry(
      values.categoryPrimarySlug,
      values.categorySubSlug
    );
    const categoryLabelLine =
      primaryMeta && subMeta ? `${primaryMeta.nameKo} · ${subMeta.nameKo}` : "";

    setSubmitting(true);
    try {
      const res = await fetch("/api/me/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          applicantNickname: nick,
          storeSlug: computedStoreSlug,
          shopName: values.shopName,
          description: values.description,
          requestNote: values.requestNote,
          phone: phoneRes.value,
          kakaoId: values.kakaoId,
          region: values.region,
          city: values.city,
          addressStreetLine: values.addressStreetLine,
          addressDetail: values.addressDetail,
          categoryPrimarySlug: values.categoryPrimarySlug,
          categorySubSlug: values.categorySubSlug,
          categoryLabelLine,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setSubmitError(t("business_phase7_681"));
        return;
      }
      if (res.status === 503) {
        if (json?.error === "supabase_unconfigured") {
          setSubmitError(t("business_phase7_682"));
        } else {
          setSubmitError(t("business_phase7_683"));
        }
        return;
      }
      if (res.status === 409) {
        if (json?.error === "already_has_active_application") {
          setSubmitError(t("business_phase7_684"));
        } else if (json?.error === "store_phone_already_registered") {
          setSubmitError(t("business_phase7_685"));
        } else if (json?.error === "store_slug_reserved") {
          setSubmitError(t("business_phase7_686"));
        } else {
          setSubmitError(t("business_phase7_687"));
        }
        return;
      }
      if (!json?.ok) {
        if (json?.error === "category_slugs_required") {
          setSubmitError(t("business_phase7_688"));
        } else if (json?.error === "applicant_nickname_required") {
          setSubmitError(t("business_phase7_689"));
        } else if (json?.error === "store_slug_required") {
          setSubmitError(t("business_phase7_690"));
        } else if (json?.error === "request_note_too_long") {
          setSubmitError(t("business_phase7_696"));
        } else if (json?.error === "owner_not_in_auth_users") {
          setSubmitError(t("business_phase7_691"));
        } else {
          setSubmitError(typeof json?.error === "string" ? json.error : t("business_phase7_692"));
        }
        return;
      }
      refreshOwnerLiteStore();
      router.push("/stores/owner");
    } catch {
      setSubmitError(t("common_network_error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="delivery-ui min-w-0 max-w-[100vw] overflow-x-hidden bg-[color:var(--delivery-bg-main)]">
      <StoresOwnerApplyHeaderChrome />
      <div
        className={`mx-auto max-w-[42rem] px-[var(--delivery-page-x)] pb-0 ${STORES_OWNER_APPLY_HEADER_BODY_OFFSET_CLASS} ${STORES_OWNER_APPLY_HEADER_FIRST_SECTION_GAP_CLASS} ${OWNER_STORE_STACK_Y_CLASS}`}
      >
        {existingLoading ? (
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 sam-text-body text-sam-muted shadow-sm sm:p-4">
            {t("business_phase7_676")}
          </div>
        ) : existingStore ? (
          <div className="rounded-ui-rect border border-amber-200 bg-amber-50 p-3 shadow-sm sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sam-ink px-2.5 py-0.5 sam-text-xxs font-bold text-white">
                {formatStoreApprovalStatusI18n(existingStore.approval_status, t)}
              </span>
              <span className="sam-text-body font-semibold text-amber-950">{t("owner_apply_pending")}</span>
            </div>
            <p className="mt-2 sam-text-body text-sam-fg">
              {String(existingStore.store_name ?? "").trim() || t("store_fallback_name")}
            </p>
          </div>
        ) : null}

        {submitError ? (
          <div className="rounded-ui-rect border border-red-200 bg-red-50 p-3 sam-text-body text-red-800 shadow-sm sm:p-4">
            {submitError}
          </div>
        ) : null}
        {!existingStore ? (
          <BusinessApplyForm
            profileSeed={profileSeed}
            computedStoreSlug={computedStoreSlug}
            onSubmit={(v) => void handleSubmit(v)}
            submitLabel={submitting ? t("business_phase7_678") : t("business_phase7_679")}
            disabled={submitting}
          />
        ) : (
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 sam-text-body text-sam-muted shadow-sm sm:p-4">
            {t("business_phase7_677")}
          </div>
        )}
      </div>
    </div>
  );
}
