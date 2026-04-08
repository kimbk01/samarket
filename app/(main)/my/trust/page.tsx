"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getCurrentUser, getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getAppSettings } from "@/lib/app-settings";
import {
  mannerBatteryAccentClass,
  mannerBatteryTier,
  mannerRawToPercent,
} from "@/lib/trust/manner-battery";
import { MannerBatteryIcon } from "@/components/trust/MannerBatteryIcon";

export default function MyTrustPage() {
  const [temp, setTemp] = useState<number | null>(() => {
    const u = getHydrationSafeCurrentUser();
    return u?.temperature ?? null;
  });

  useEffect(() => {
    const sync = () => {
      const u = getCurrentUser();
      setTemp(u?.temperature ?? null);
    };
    sync();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, sync);
  }, []);

  const mannerPercent = temp != null ? mannerRawToPercent(temp) : null;
  const mannerTier = mannerPercent != null ? mannerBatteryTier(mannerPercent) : null;

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="나의 배터리·신뢰"
        subtitle="거래 매너 지표"
        backHref="/mypage"
        section="account"
      />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-[13px] text-gray-500">
            {getAppSettings().speedDisplayLabel ?? "배터리"} (프로필 기준)
          </p>
          {mannerPercent != null && mannerTier != null ? (
            <>
              <div className="mt-3 flex justify-center">
                <MannerBatteryIcon tier={mannerTier} percent={mannerPercent} size="lg" />
              </div>
              <p
                className={`mt-2 text-[36px] font-bold tabular-nums ${mannerBatteryAccentClass(
                  mannerTier
                )}`}
              >
                {mannerPercent}%
              </p>
            </>
          ) : (
            <p className="mt-2 text-[36px] font-bold text-gray-400">—</p>
          )}
          <p className="mt-4 text-[13px] leading-relaxed text-gray-600">
            거래 후기·매너 평가는 보통 <strong className="text-gray-800">7~10일 후</strong>에 배터리에
            반영되는 경우가 많아요. 분쟁 처리 중에는 일시 보류될 수 있습니다.
          </p>
        </div>
        <Link
          href="/mypage/account"
          className="mt-6 block text-center text-[14px] font-medium text-signature underline-offset-2 hover:underline"
        >
          내 계정에서 닉네임·지역 수정
        </Link>
      </div>
    </div>
  );
}
