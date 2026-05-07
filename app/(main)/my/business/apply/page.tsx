"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BusinessApplyForm,
  type BusinessApplyFormValues,
  type BusinessApplyProfileSeed,
} from "@/components/business/BusinessApplyForm";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { decodeProfileAppLocationPair } from "@/lib/profile/profile-location";
import { parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
import {
  getBrowsePrimaryBySlug,
  getBrowseSubIndustry,
} from "@/lib/stores/browse-mock/queries";
import { refreshOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";

const HAS_ANY_STORE = true;

const STATUS_KO: Record<string, string> = {
  pending: "신청대기",
  under_review: "검토중",
  revision_requested: "보완요청",
  approved: "승인",
  rejected: "반려",
  suspended: "정지",
};

export default function BusinessApplyRoute() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profileSeed, setProfileSeed] = useState<BusinessApplyProfileSeed | null>(null);
  const [existingStore, setExistingStore] = useState<any | null>(null);
  const [existingLoading, setExistingLoading] = useState(true);
  const [computedStoreSlug, setComputedStoreSlug] = useState<string>("");

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
      setSubmitError("프로필 닉네임을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const phoneRes = normalizeOptionalPhMobileDb(values.phone);
    if (!phoneRes.ok) {
      setSubmitError(phoneRes.error);
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
        setSubmitError(
          "로그인이 필요합니다. 로그인 페이지에서 이메일(또는 수동 가입 아이디)과 비밀번호로 로그인한 뒤 다시 시도해 주세요."
        );
        return;
      }
      if (res.status === 503) {
        if (json?.error === "supabase_unconfigured") {
          setSubmitError(
            "매장 DB(Supabase)가 연결되어 있지 않아 신청을 저장할 수 없습니다. 환경 변수를 확인하거나 관리자에게 문의해 주세요."
          );
        } else {
          setSubmitError("서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }
      if (res.status === 409) {
        if (json?.error === "already_has_active_application") {
          setSubmitError("이미 심사 중이거나 승인된 매장이 있습니다. 내 상점에서 확인해 주세요.");
        } else if (json?.error === "store_phone_already_registered") {
          setSubmitError(
            "이 전화번호는 이미 다른 매장 신청·운영에 사용 중입니다. 다른 번호를 입력하거나 기존 매장 담당자에게 문의해 주세요."
          );
        } else if (json?.error === "store_slug_reserved") {
          setSubmitError(
            "이 매장 ID는 시스템 예약어라 사용할 수 없습니다. 회원 ID를 변경하거나 관리자에게 문의해 주세요."
          );
        } else {
          setSubmitError("요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }
      if (!json?.ok) {
        if (json?.error === "category_slugs_required") {
          setSubmitError("1차·2차 업종을 모두 선택해 주세요.");
        } else if (json?.error === "applicant_nickname_required") {
          setSubmitError("신청자 닉네임을 1~20자로 입력해 주세요.");
        } else if (json?.error === "store_slug_required") {
          setSubmitError("매장 ID(영문/숫자/하이픈, 3~40자)를 입력해 주세요.");
        } else if (json?.error === "owner_not_in_auth_users") {
          setSubmitError(
            "현재 계정이 auth.users에 없어 매장을 등록할 수 없습니다. Supabase 로그인 계정을 사용해 주세요."
          );
        } else {
          setSubmitError(typeof json?.error === "string" ? json.error : "신청에 실패했습니다.");
        }
        return;
      }
      refreshOwnerLiteStore();
      router.push("/stores/owner");
    } catch {
      setSubmitError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen min-w-0 max-w-[100vw] overflow-x-hidden bg-[#f0f2f5]">
      <div className="bg-[#1C8DB8]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="sam-text-body-lg font-bold text-white">배달 입점 신청</h1>
        </div>
      </div>
      <div className={`mx-auto max-w-4xl px-4 py-4 ${OWNER_STORE_STACK_Y_CLASS}`}>

        {existingLoading ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-secondary text-sam-muted shadow-sm">
            신청 상태 확인 중…
          </div>
        ) : existingStore ? (
          <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sam-ink px-2.5 py-0.5 sam-text-xxs font-bold text-white">
                {STATUS_KO[String(existingStore.approval_status ?? "").trim()] ?? String(existingStore.approval_status ?? "")}
              </span>
              <span className="sam-text-body-secondary font-semibold text-amber-950">신청중입니다.</span>
            </div>
            <p className="mt-2 sam-text-body-secondary text-sam-fg">
              {String(existingStore.store_name ?? "").trim() || "매장"}
            </p>
          </div>
        ) : null}

        {submitError ? (
          <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800 shadow-sm">{submitError}</div>
        ) : null}
        {!existingStore ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
            <BusinessApplyForm
              profileSeed={profileSeed}
              computedStoreSlug={computedStoreSlug}
              onSubmit={(v) => void handleSubmit(v)}
              submitLabel={submitting ? "제출 중…" : "신청하기"}
              disabled={submitting}
            />
          </div>
        ) : (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-body-secondary text-sam-muted shadow-sm">
            신청이 진행 중인 동안에는 추가 신청을 할 수 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
