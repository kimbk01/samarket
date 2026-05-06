"use client";

import { useMemo } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export function ProfileEditHeader({
  backHref,
  formId,
}: {
  backHref: string;
  formId: string;
}) {
  const rightSlot = useMemo(
    () => (
      <button
        type="submit"
        form={formId}
        className="inline-flex min-h-9 items-center justify-center rounded-[10px] bg-[color:#1C8DB8] px-3 text-[13px] font-semibold text-white"
      >
        저장
      </button>
    ),
    [formId]
  );

  return (
    <MySubpageHeader
      title="프로필 수정"
      subtitle="닉네임, 사진, 나의 상태, 지역, 동네"
      backHref={backHref}
      hideCtaStrip
      rightSlot={rightSlot}
      showHubQuickActions={false}
    />
  );
}

