"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import {
  BusinessApplyForm,
  type BusinessApplyFormValues,
  type BusinessApplyInitial,
  type BusinessApplyProfileSeed,
} from "@/components/business/BusinessApplyForm";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { OwnerSupportContextBridge } from "@/components/support/OwnerSupportContextBridge";
import {
  StoresOwnerApplyHeaderChrome,
  STORES_OWNER_APPLY_HEADER_BODY_OFFSET_CLASS,
} from "@/components/stores/home/hub/StoresOwnerApplyHeaderChrome";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { refreshOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import { fetchMeStoresListDeduped, parseStoreRowsFromMeStoresJson } from "@/lib/me/fetch-me-stores-deduped";
import {
  evaluateClientProfileRequirements,
  requireProfileCompletionClient,
} from "@/lib/profile/require-profile-completion.client";
import { buildProfileEditHref } from "@/lib/profile/profile-completion-modal-client";
import type { ProfileRequirementField } from "@/lib/profile/profile-requirements";
import type { Profile } from "@/lib/types/profile";
import type { ProfileRow } from "@/lib/profile/types";
import { openMemberAddressBook } from "@/lib/addresses/member-address-caller-context";
import { storeApplicationErrorKey } from "@/lib/stores/store-application-errors";
import { storeBaseNameWithoutBranch } from "@/lib/stores/store-application-limits";
import { FORM_INTERACTIVE_PRESS_CLASS } from "@/lib/ui/form-keyboard-viewport-contract";

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

type AppStoreRow = {
  id: string;
  store_name?: string | null;
  branch_name?: string | null;
  applicant_nickname?: string | null;
  description?: string | null;
  application_request_note?: string | null;
  kakao_id?: string | null;
  phone?: string | null;
  phone_verified_at?: string | null;
  region?: string | null;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  formatted_address?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  approval_status?: string | null;
  revision_note?: string | null;
  store_categories?: { slug?: string | null } | { slug?: string | null }[] | null;
  store_topics?: { slug?: string | null } | { slug?: string | null }[] | null;
};

function embedSlug(v: AppStoreRow["store_categories"]): string {
  const r = Array.isArray(v) ? v[0] : v;
  return String(r?.slug ?? "");
}

function toInitial(s: AppStoreRow): BusinessApplyInitial {
  const lat = typeof s.lat === "number" ? s.lat : null;
  const lng = typeof s.lng === "number" ? s.lng : null;
  return {
    applicantNickname: String(s.applicant_nickname ?? ""),
    shopName: storeBaseNameWithoutBranch(String(s.store_name ?? ""), s.branch_name),
    branchName: String(s.branch_name ?? ""),
    description: String(s.description ?? ""),
    requestNote: String(s.application_request_note ?? ""),
    kakaoId: String(s.kakao_id ?? ""),
    categoryPrimarySlug: embedSlug(s.store_categories),
    categorySubSlug: embedSlug(s.store_topics),
    phone: String(s.phone ?? ""),
    phoneVerifiedAt: s.phone_verified_at ?? null,
    location:
      lat != null && lng != null && String(s.formatted_address ?? "").trim()
        ? {
            lat,
            lng,
            formattedAddress: String(s.formatted_address ?? ""),
            placeId: s.place_id ?? null,
            region: String(s.region ?? ""),
            city: String(s.city ?? ""),
            street: String(s.address_line1 ?? ""),
            detail: String(s.address_line2 ?? ""),
          }
        : null,
    revisionNote: String(s.revision_note ?? ""),
  };
}

/**
 * 매장 입점 신청 · 보완 제출 (매장 신청 v2 · Owner 2026-11-10).
 * - 매장이 없으면 신청서. 매장이 있으면(상태 무관) 운영 홈으로 — 상태 안내는 운영 홈 한 곳(1차 감사 A-8).
 * - `?mode=revise&storeId=` + 보완 요청 상태면 같은 신청서로 「보완 내용 제출」.
 */
function BusinessApplyRouteInner() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? APPLY_PATH;
  const reviseStoreId = searchParams.get("mode") === "revise" ? (searchParams.get("storeId") ?? "").trim() : "";
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profileSeed, setProfileSeed] = useState<BusinessApplyProfileSeed | null>(null);
  const [profileRow, setProfileRow] = useState<Profile | null>(null);
  const [storesLoading, setStoresLoading] = useState(true);
  const [reviseInitial, setReviseInitial] = useState<BusinessApplyInitial | null>(null);
  const [gateLoading, setGateLoading] = useState(true);
  const [gateMissing, setGateMissing] = useState<ProfileRequirementField[] | null>(null);
  /** 약관 버전이 바뀌었다고 서버가 알리면 서약 섹션을 다시 불러온다 */
  const [partnerRefreshKey, setPartnerRefreshKey] = useState(0);

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
      setProfileRow(profileRowForGate(p));
      setProfileSeed({ username: String(p.username ?? "").trim().replace(/^@+/, "") });
      await refreshGate(profileRowForGate(p));
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshGate]);

  useEffect(() => {
    let cancelled = false;
    let redirecting = false;
    setStoresLoading(true);
    void (async () => {
      try {
        const { status, json } = await fetchMeStoresListDeduped();
        if (cancelled) return;
        const stores = status === 200 ? parseStoreRowsFromMeStoresJson(json) ?? [] : [];
        const mine = reviseStoreId ? stores.find((s) => s.id === reviseStoreId) : stores[0];
        if (reviseStoreId && mine && String(mine.approval_status) === "revision_requested") {
          const res = await fetch(`/api/me/stores/${encodeURIComponent(mine.id)}/application`, {
            credentials: "include",
            cache: "no-store",
          });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; store?: AppStoreRow };
          if (cancelled) return;
          if (j?.ok && j.store) {
            setReviseInitial(toInitial(j.store));
            return;
          }
        }
        if (mine || stores.length > 0) {
          redirecting = true;
          router.replace(OwnerRoutes.hub((mine ?? stores[0])!.id));
        }
      } catch {
        /* 목록 실패 — 신청서는 보여 주되 서버가 계정당 1개를 다시 막는다 */
      } finally {
        if (!cancelled && !redirecting) setStoresLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reviseStoreId, router]);

  const handleSubmit = async (values: BusinessApplyFormValues) => {
    const gated = await requireAuthAction("owner_dashboard", async () => {}, { next: pathname });
    if (!gated) return;
    if (profileRow && !reviseInitial) {
      const profileOk = await requireProfileCompletionClient(profileRow, "owner_store_register", { next: pathname });
      if (!profileOk) {
        await refreshGate(profileRow);
        return;
      }
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const body = {
        applicantNickname: values.applicantNickname,
        shopName: values.shopName,
        branchName: values.branchName,
        description: values.description,
        requestNote: values.requestNote,
        kakaoId: values.kakaoId,
        categoryPrimarySlug: values.categoryPrimarySlug,
        categorySubSlug: values.categorySubSlug,
        phoneVerificationId: values.phoneVerification?.verificationId ?? null,
        location: values.location,
        ...(values.partnerAgreement ? { partner_agreement: values.partnerAgreement } : {}),
      };
      const url = reviseInitial
        ? `/api/me/stores/${encodeURIComponent(reviseStoreId)}/resubmit`
        : "/api/me/stores";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; storeId?: string; store?: { id?: string } };
      if (!res.ok || !json?.ok) {
        const code = String(json?.error ?? (res.status === 401 ? "unauthorized" : ""));
        setSubmitError(t(storeApplicationErrorKey(code)));
        if (code === "partner_terms_version_mismatch") setPartnerRefreshKey((n) => n + 1);
        if (code === "master_address_required") await refreshGate(profileRow);
        if (code === "already_has_active_application" && json.storeId) router.replace(OwnerRoutes.hub(json.storeId));
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      refreshOwnerLiteStore();
      const id = String(json.store?.id ?? reviseStoreId ?? "");
      const base = OwnerRoutes.hub(id || null);
      router.replace(`${base}${base.includes("?") ? "&" : "?"}applied=${reviseInitial ? "resubmitted" : "submitted"}`);
    } catch {
      setSubmitError(t("common_network_error"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  };

  const gateBlocked = !reviseInitial && !gateLoading && gateMissing != null && gateMissing.length > 0;
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

  const loading = storesLoading || (gateLoading && !reviseInitial);

  return (
    <OwnerSupportContextBridge enabled category="STORE_APPROVAL" sourceSurface="owner_store_apply">
      <div className="min-w-0 w-full max-w-full bg-[var(--biz-app-bg)]">
        <StoresOwnerApplyHeaderChrome />
        <div
          className={`mx-auto max-w-[42rem] px-2 pb-0 sm:px-2 ${STORES_OWNER_APPLY_HEADER_BODY_OFFSET_CLASS} ${OWNER_STORE_STACK_Y_CLASS}`}
        >
          {loading ? (
            <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 text-[14px] text-sam-muted shadow-sm">
              {t("business_phase7_676")}
            </div>
          ) : gateBlocked ? (
            <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
              <p className="text-[16px] font-bold text-sam-fg">{t("business_phase7_702")}</p>
              <p className="mt-2 text-[14px] text-sam-muted">{t("business_phase7_703")}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px] text-sam-fg">
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
                    className={`inline-flex min-h-[48px] items-center justify-center rounded-ui-rect bg-sam-primary px-4 text-[16px] font-bold text-sam-on-primary ${FORM_INTERACTIVE_PRESS_CLASS}`}
                  >
                    {t("business_phase7_707")}
                  </Link>
                ) : null}
                {needAddress ? (
                  <button
                    type="button"
                    onClick={openAddressForGate}
                    className={`inline-flex min-h-[48px] items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-[16px] font-semibold text-sam-fg ${FORM_INTERACTIVE_PRESS_CLASS}`}
                  >
                    {t("business_phase7_708")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              {submitError ? (
                <div
                  className="rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft p-3 text-[14px] font-medium text-sam-danger shadow-sm"
                  role="alert"
                >
                  {submitError}
                </div>
              ) : null}
              <BusinessApplyForm
                mode={reviseInitial ? "revise" : "apply"}
                storeId={reviseInitial ? reviseStoreId : null}
                initial={reviseInitial}
                profileSeed={profileSeed}
                partnerRefreshKey={partnerRefreshKey}
                onSubmit={(v) => void handleSubmit(v)}
                submitLabel={submitting ? t("business_phase7_678") : undefined}
                disabled={submitting}
              />
            </>
          )}
        </div>
      </div>
    </OwnerSupportContextBridge>
  );
}

export default function BusinessApplyRoute() {
  return (
    <Suspense fallback={null}>
      <BusinessApplyRouteInner />
    </Suspense>
  );
}
