import Link from "next/link";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

export function ProfileActionButtons() {
  return (
    <div className="mt-3 flex gap-2">
      <Link
        href={MYPAGE_PROFILE_EDIT_HREF}
        className="flex-1 rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 text-center sam-text-body font-medium text-sam-fg"
      >
        프로필 수정
      </Link>
      <Link
        href={buildMypageInfoHubHref()}
        className="flex-1 rounded-ui-rect border border-signature bg-signature/10 py-2.5 text-center sam-text-body font-medium text-signature"
      >
        앱 · 서비스 설정
      </Link>
    </div>
  );
}
