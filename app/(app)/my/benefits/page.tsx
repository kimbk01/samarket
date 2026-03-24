"use client";

import { useEffect, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { MemberBenefitList } from "@/components/member-benefits/MemberBenefitList";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";

function roleLabel(role: string | null | undefined): string {
  const r = (role ?? "").toLowerCase();
  if (r === "admin" || r === "master") return "운영";
  if (r === "store_owner" || r === "business") return "사업자";
  return "일반";
}

export default function MyBenefitsPage() {
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user?.id) {
      setRole(null);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setRole(null);
      return;
    }
    let cancelled = false;
    void sb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setRole(null);
          return;
        }
        setRole((data as { role?: string }).role ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const policies: MemberBenefitPolicy[] = [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/my" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          회원 혜택
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-[13px] text-gray-500">내 회원 구분 (profiles.role)</p>
          <div className="mt-1 flex items-center gap-2">
            {role === undefined ? (
              <span className="text-[14px] text-gray-400">불러오는 중…</span>
            ) : role === null ? (
              <span className="text-[14px] text-gray-600">
                로그인 후 프로필을 불러올 수 있습니다.
              </span>
            ) : (
              <span className="rounded bg-gray-100 px-2 py-1 text-[14px] font-medium text-gray-800">
                {roleLabel(role)}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          혜택 정책 목록은 DB 설계·관리자 연동 후 표시됩니다. 샘플 정책은 사용하지 않습니다.
        </div>
        <div>
          <h2 className="mb-2 text-[15px] font-semibold text-gray-900">적용 혜택</h2>
          <MemberBenefitList
            policies={policies}
            emptyMessage="등록된 혜택이 없습니다. 공지를 확인해 주세요."
          />
        </div>
      </div>
    </div>
  );
}
