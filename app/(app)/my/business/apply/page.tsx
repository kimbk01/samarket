"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { BusinessApplyForm, type BusinessApplyFormValues } from "@/components/business/BusinessApplyForm";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";

export default function BusinessApplyRoute() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: BusinessApplyFormValues) => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          shopName: values.shopName,
          description: values.description,
          phone: values.phone,
          kakaoId: values.kakaoId,
          region: values.region,
          city: values.city,
          addressLabel: values.addressLabel,
          category: values.category,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setSubmitError(
          "로그인이 필요합니다. 로그인 페이지의「아이디 로그인」또는 내 정보 상단에서 수동 가입한 아이디·비밀번호로 로그인한 뒤 다시 시도해 주세요."
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
        } else {
          setSubmitError("요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }
      if (!json?.ok) {
        if (json?.error === "owner_not_in_auth_users") {
          setSubmitError(
            "현재 계정이 auth.users에 없어 매장을 등록할 수 없습니다. Supabase 로그인 계정을 사용해 주세요."
          );
        } else {
          setSubmitError(typeof json?.error === "string" ? json.error : "신청에 실패했습니다.");
        }
        return;
      }
      router.push("/my/business");
    } catch {
      setSubmitError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/my/business" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          매장(비즈) 신청
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className={`px-4 py-4 ${OWNER_STORE_STACK_Y_CLASS}`}>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-[13px] leading-relaxed text-gray-600">
          제출 후 <strong className="text-gray-900">관리자 매장 심사</strong>를 거칩니다. 승인되면{" "}
          <strong className="text-gray-900">판매 권한</strong>이 별도로 열릴 수 있어요. 진행 상태는{" "}
          <strong className="text-gray-900">내 상점</strong>에서 확인할 수 있습니다.
        </div>
        {submitError ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800">{submitError}</div>
        ) : null}
        <BusinessApplyForm
          onSubmit={(v) => void handleSubmit(v)}
          submitLabel={submitting ? "제출 중…" : "신청하기"}
          disabled={submitting}
        />
      </div>
    </div>
  );
}
