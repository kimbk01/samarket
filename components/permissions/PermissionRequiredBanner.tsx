"use client";

import Link from "next/link";
import { buildMyPageHref } from "@/components/mypage/mypage-nav";
import { Sam } from "@/lib/ui/sam-component-classes";

export function PermissionRequiredBanner({
  message,
  showSettingsLink = true,
}: {
  message: string;
  showSettingsLink?: boolean;
}) {
  return (
    <div
      role="status"
      className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2.5 sam-text-body-secondary leading-snug text-amber-950"
    >
      <p>{message}</p>
      {showSettingsLink ? (
        <p className="mt-2">
          <Link href={buildMyPageHref("settings", "device-permissions")} className={`${Sam.text.body} font-medium text-sam-fg underline`}>
            설정에서 권한 확인
          </Link>
        </p>
      ) : null}
    </div>
  );
}
