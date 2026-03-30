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
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";
import {
  getBrowsePrimaryBySlug,
  getBrowseSubIndustry,
} from "@/lib/stores/browse-mock/queries";
import { refreshOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";

export default function BusinessApplyRoute() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profileSeed, setProfileSeed] = useState<BusinessApplyProfileSeed | null>(null);

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
      setProfileSeed({
        applicantNickname: (p.nickname ?? "").trim(),
        phoneDigits: parsePhMobileInput(p.phone ?? ""),
        regionId: loc.regionId,
        cityId: loc.cityId,
        postalCode: (p.postal_code ?? "").trim(),
        addressStreetLine: (p.address_street_line ?? "").trim(),
        addressDetail: (p.address_detail ?? "").trim(),
        profileBio: (p.bio ?? "").trim(),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (values: BusinessApplyFormValues) => {
    setSubmitError(null);
    const nick = values.applicantNickname.trim();
    if (!nick || nick.length > 20) {
      setSubmitError("신청자 닉네임을 1~20자로 입력해 주세요.");
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
          applicantNickname: values.applicantNickname.trim(),
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
      router.push("/my/business");
    } catch {
      setSubmitError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen min-w-0 max-w-[100vw] overflow-x-hidden bg-background">
      <MySubpageHeader title="매장 신청" backHref="/my/business" section="store" />
      <div className={`mx-auto max-w-4xl px-4 py-4 ${OWNER_STORE_STACK_Y_CLASS}`}>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-[13px] leading-relaxed text-gray-600">
          제출 후 <strong className="text-gray-900">관리자 매장 심사</strong>를 거칩니다. 승인되면{" "}
          <strong className="text-gray-900">판매 권한</strong>이 별도로 열릴 수 있어요. 진행 상태는{" "}
          <strong className="text-gray-900">내 상점</strong>에서 확인할 수 있습니다.
        </div>
        {submitError ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800">{submitError}</div>
        ) : null}
        <BusinessApplyForm
          profileSeed={profileSeed}
          onSubmit={(v) => void handleSubmit(v)}
          submitLabel={submitting ? "제출 중…" : "신청하기"}
          disabled={submitting}
        />
      </div>
    </div>
  );
}
