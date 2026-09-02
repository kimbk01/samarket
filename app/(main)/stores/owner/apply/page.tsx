"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
import { OwnerSupportContextBridge } from "@/components/support/OwnerSupportContextBridge";
import {
  StoresOwnerApplyHeaderChrome,
  STORES_OWNER_APPLY_HEADER_BODY_OFFSET_CLASS,
} from "@/components/stores/home/hub/StoresOwnerApplyHeaderChrome";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
import {
  getBrowsePrimaryBySlug,
  getBrowseSubIndustry,
} from "@/lib/stores/browse-taxonomy-seed-queries";
import { refreshOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import { formatStoreApprovalStatusI18n } from "@/lib/stores/store-approval-label-ko";
import {
  fetchMeStoresListDeduped,
  parseStoreRowsFromMeStoresJson,
} from "@/lib/me/fetch-me-stores-deduped";
import {
  evaluateClientProfileRequirements,
  requireProfileCompletionClient,
} from "@/lib/profile/require-profile-completion.client";
import { buildProfileEditHref } from "@/lib/profile/profile-completion-modal-client";
import type { ProfileRequirementField } from "@/lib/profile/profile-requirements";
import type { Profile } from "@/lib/types/profile";
import type { ProfileRow } from "@/lib/profile/types";
import { openMemberAddressBook } from "@/lib/addresses/member-address-caller-context";

const HAS_ANY_STORE = true;
const APPLY_PATH = "/stores/owner/apply";

function profileRowForGate(p: ProfileRow): Profile {
  return {
    id: p.id,
    email: p.email ?? "",
    nickname: (p.nickname ?? p.display_name ?? "").trim() || "user",
    avatar_url: p.avatar_url ?? null,
    display_name: p.display_name,
    username: p.username,
    phone: p.phone,
    phone_verified: p.phone_verified === true,
    phone_verified_at: p.phone_verified_at ?? null,
    phone_verification_method: p.phone_verification_method ?? null,
    role: p.role ?? undefined,
    provider: p.provider ?? null,
    auth_provider: p.auth_provider ?? null,
    temperature: 50,
  };
}

export default function BusinessApplyRoute() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? APPLY_PATH;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profileSeed, setProfileSeed] = useState<BusinessApplyProfileSeed | null>(null);
  const [profileRow, setProfileRow] = useState<Profile | null>(null);
  const [existingStore, setExistingStore] = useState<any | null>(null);
  const [existingLoading, setExistingLoading] = useState(true);
  const [computedStoreSlug, setComputedStoreSlug] = useState<string>("");
  const [gateLoading, setGateLoading] = useState(true);
  const [gateMissing, setGateMissing] = useState<ProfileRequirementField[] | null>(null);

  const refreshGate = useCallback(async (profile: Profile | null) => {
    if (!profile) {
      setGateMissing(["phone_verified", "display_name", "default_address"]);
      setGateLoading(false);
      return;
    }
    const evaluation = await evaluateClientProfileRequirements(profile, "owner_store_register");
    setGateMissing(evaluation.satisfied ? [] : evaluation.missingFields);
    setGateLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setGateLoading(true);
      const p = await getMyProfile();
      if (cancelled) return;
      if (!p) {
        setProfileSeed(null);
        setProfileRow(null);
        await refreshGate(null);
        return;
      }
      const loc = decodeProfileAppLocationPair(p.region_code, p.region_name);
      const uname = String(p.username ?? "").trim().replace(/^@+/, "");
      setProfileRow(profileRowForGate(p));
      setProfileSeed({
        applicantNickname: "",
        phoneDigits: parsePhMobileInput(p.phone ?? ""),
        regionId: loc.regionId,
        cityId: loc.cityId,
        addressStreetLine: "",
        addressDetail: "",
        profileBio: (p.bio ?? "").trim(),
        username: uname,
      });
      await refreshGate(profileRowForGate(p));
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshGate]);

  useEffect(() => {
    let cancelled = false;
    setExistingLoading(true);
    void (async () => {
      try {
        const { status, json } = await fetchMeStoresListDeduped();
        if (cancelled) return;
        const stores = status === 200 ? parseStoreRowsFromMeStoresJson(json) ?? [] : [];
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
    const gated = await requireAuthAction("owner_dashboard", async () => {}, { next: pathname });
    if (!gated) return;

    if (profileRow) {
      const profileOk = await requireProfileCompletionClient(profileRow, "owner_store_register", {
        next: pathname,
      });
      if (!profileOk) {
        await refreshGate(profileRow);
        return;
      }
    }

    setSubmitError(null);
    const nick = values.applicantNickname.trim();
    if (!nick || nick.length > 20) {
      setSubmitError(t("business_phase7_689"));
      return;
    }
    const phoneRes = normalizeOptionalPhMobileDb(values.phone);
    if (!phoneRes.ok || !phoneRes.value) {
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
        } else if (json?.error === "master_address_required") {
          setSubmitError(t("business_phase7_671"));
          await refreshGate(profileRow);
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

  const gateBlocked = !gateLoading && gateMissing != null && gateMissing.length > 0;
  const needPhone = gateMissing?.includes("phone_verified") ?? false;
  const needName = gateMissing?.includes("display_name") ?? false;
  const needAddress = gateMissing?.includes("default_address") ?? false;

  const openAddressForGate = () => {
    openMemberAddressBook(router, {
      caller: "owner",
      mode: "select",
      purpose: "store_owner_apply_gate_master",
      apply: { kind: "set_default_master" },
      restore: { kind: "href", href: APPLY_PATH },
    });
  };

  return (
    <OwnerSupportContextBridge
      enabled
      category="STORE_APPROVAL"
      sourceSurface="owner_store_apply"
    >
    <div className="min-w-0 w-full max-w-full bg-[var(--biz-app-bg)]">
      <StoresOwnerApplyHeaderChrome />
      <div
        className={`mx-auto max-w-[42rem] px-2 pb-0 sm:px-2 ${STORES_OWNER_APPLY_HEADER_BODY_OFFSET_CLASS} ${OWNER_STORE_STACK_Y_CLASS}`}
      >
        {existingLoading || gateLoading ? (
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
        ) : gateBlocked ? (
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
            <p className="sam-text-body font-semibold text-sam-fg">{t("business_phase7_702")}</p>
            <p className="mt-2 sam-text-body-secondary text-sam-muted">{t("business_phase7_703")}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 sam-text-body text-sam-fg">
              {needPhone ? <li>{t("business_phase7_704")}</li> : null}
              {needName ? <li>{t("business_phase7_705")}</li> : null}
              {needAddress ? <li>{t("business_phase7_706")}</li> : null}
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {needPhone || needName ? (
                <Link
                  href={buildProfileEditHref({
                    returnTo: APPLY_PATH,
                    required: [
                      ...(needPhone ? (["phone_verified"] as const) : []),
                      ...(needName ? (["display_name"] as const) : []),
                    ],
                  })}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-ui-rect bg-signature px-4 sam-text-body font-semibold text-white"
                >
                  {t("business_phase7_707")}
                </Link>
              ) : null}
              {needAddress ? (
                <button
                  type="button"
                  onClick={openAddressForGate}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 sam-text-body font-semibold text-sam-fg"
                >
                  {t("business_phase7_708")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {submitError ? (
          <div className="rounded-ui-rect border border-red-200 bg-red-50 p-3 sam-text-body text-red-800 shadow-sm sm:p-4">
            {submitError}
          </div>
        ) : null}

        {!existingStore && !gateLoading && !gateBlocked ? (
          <BusinessApplyForm
            profileSeed={profileSeed}
            computedStoreSlug={computedStoreSlug}
            onSubmit={(v) => void handleSubmit(v)}
            submitLabel={submitting ? t("business_phase7_678") : t("business_phase7_679")}
            disabled={submitting}
          />
        ) : null}

        {existingStore && !existingLoading ? (
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 sam-text-body text-sam-muted shadow-sm sm:p-4">
            {t("business_phase7_677")}
          </div>
        ) : null}
      </div>
    </div>
    </OwnerSupportContextBridge>
  );
}
