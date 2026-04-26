"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AddressManagementClient } from "@/components/addresses/AddressManagementClient";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";

/**
 * 로그인 직후 대표 주소가 없으면 도착하는 화면 (스펙 1-C, 9).
 *
 * - 사용자가 주소를 저장하면 `SAMARKET_ADDRESSES_UPDATED_EVENT` 가 디스패치된다.
 * - 본 화면은 그 이벤트를 받으면 서버 게이트(`/api/me/mandatory-address-gate`)에 재확인하고,
 *   대표 주소가 확정되면 0.6초 안내 후 `router.replace(next || /home)` 으로 이동한다.
 * - `router.back()` 은 사용하지 않는다 (스펙 2).
 * - "나중에 하기" 는 읽기 전용으로 `/home` 에 보낸다. 글쓰기·채팅·주문 시 다시 게이트가 막는다.
 */
export function OnboardingAddressClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(
    () => sanitizeNextPath(searchParams?.get("next") ?? null),
    [searchParams]
  );
  const target = next ?? POST_LOGIN_PATH;

  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  const checkGateAndMaybeNavigate = useCallback(async () => {
    if (completedRef.current) return;
    try {
      const res = await fetch("/api/me/mandatory-address-gate", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        authenticated?: boolean;
        needsBlock?: boolean;
      };
      if (!json.ok) return;
      if (json.authenticated && json.needsBlock === false) {
        completedRef.current = true;
        setCompleted(true);
        // 다음 화면(RegionProvider·MyProfileCard 등)이 새 region/주소를 즉시 보도록 dedupe 캐시 끊기.
        try {
          invalidateMeProfileDedupedCache();
        } catch {
          /* 흐름 차단 금지 */
        }
        window.setTimeout(() => {
          router.replace(target);
        }, 600);
      }
    } catch {
      /* 네트워크 실패 시 다음 이벤트에서 재시도 */
    }
  }, [router, target]);

  useEffect(() => {
    void checkGateAndMaybeNavigate();
    const onUpdated = () => void checkGateAndMaybeNavigate();
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onUpdated);
    };
  }, [checkGateAndMaybeNavigate]);

  const handleSkip = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    router.replace(POST_LOGIN_PATH);
  }, [router]);

  return (
    <OnboardingShell
      title="대표 주소 등록"
      description="필리핀 내 거래·동네·배달을 이용하려면 지도에서 위치를 지정한 대표 주소를 한 곳 등록해 주세요."
      onSkip={handleSkip}
      skipLabel="나중에 하기"
    >
      <AddressManagementClient embedded />
      {completed ? (
        <p
          role="status"
          className="rounded-ui-rect border border-sam-success/40 bg-sam-success-soft px-3 py-2 sam-text-body text-sam-success"
        >
          주소 설정이 완료되었습니다. 잠시 후 자동으로 이동합니다…
        </p>
      ) : null}
    </OnboardingShell>
  );
}
