import { UserListContent } from "@/components/my/settings/UserListContent";
import { LogoutContent } from "@/components/my/settings/LogoutContent";
import { MyPageQuickActions } from "@/components/mypage/MyPageQuickActions";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import type { MyPageConsoleProps } from "@/components/mypage/types";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import {
  MYPAGE_PROFILE_EDIT_HREF,
  buildMypageItemHref,
} from "@/lib/mypage/mypage-mobile-nav-registry";
import { hasFormalMemberContactVerification } from "@/lib/auth/member-access";

type Props = Pick<
  MyPageConsoleProps,
  | "profile"
  | "mannerScore"
  | "favoriteBadge"
  | "notificationBadge"
  | "overviewCounts"
  | "storeAttentionSummary"
>;

export function AccountTab({
  section,
  profile,
  mannerScore,
  favoriteBadge,
  notificationBadge,
  overviewCounts,
  storeAttentionSummary,
}: Props & { section: string }) {
  const contactFormal = hasFormalMemberContactVerification({
    phone_verified: profile.phone_verified || Boolean(profile.phone_verified_at),
    auth_provider: profile.provider ?? profile.auth_provider,
    email: profile.email,
  });

  if (section === "profile") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description="닉네임, 프로필 사진, 기본 소개와 지역 정보를 확인하고 수정합니다." />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <div className="space-y-2">
            <p className="sam-text-body font-semibold text-sam-fg">
              {profile.nickname?.trim() || "닉네임 없음"}
            </p>
            <p className="sam-text-helper text-sam-muted">{profile.email ?? "이메일 정보 없음"}</p>
            <p className="sam-text-helper text-sam-muted">
              연락처 {profile.phone?.trim() || "미등록"} · {contactFormal ? "인증 완료" : "인증 필요"}
            </p>
            <div className="pt-1">
              <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1.5" />
            </div>
          </div>
        </div>
        <MyPageQuickActions
          items={[
            { label: "프로필 수정", href: MYPAGE_PROFILE_EDIT_HREF, caption: "사진, 닉네임, 소개" },
            { label: "계정 기본정보", href: "/mypage/account", caption: "계정 상세와 연락처" },
            {
              label: "주소 관리",
              href: buildMypageItemHref("settings", "address"),
              caption: "거래 / 생활 / 배달 주소",
            },
          ]}
        />
      </div>
    );
  }

  if (section === "basic") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description="계정 상세, 연락처 인증, 로그아웃과 탈퇴 같은 계정 단위 작업을 관리합니다." />
        <MyPageQuickActions
          items={[
            { label: "계정 상세", href: "/mypage/account", caption: "내 계정 정보 확인" },
            { label: "프로필 수정", href: MYPAGE_PROFILE_EDIT_HREF, caption: "기본 프로필 편집" },
            {
              label: "탈퇴하기",
              href: buildMypageItemHref("settings", "leave"),
              caption: "설정에서 처리",
            },
          ]}
        />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="mb-3 sam-text-helper text-sam-muted">로그아웃을 누르면 확인 팝업에서 바로 종료됩니다.</p>
          <LogoutContent />
        </div>
      </div>
    );
  }

  if (section === "favorite-users") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description="모아보는 사용자를 관리합니다. 거래, 커뮤니티, 메신저에서 공통으로 참조되는 사용자 목록입니다." />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <UserListContent type="favorite" emptyMessage="모아보는 사용자가 없습니다." />
        </div>
      </div>
    );
  }

  if (section === "blocked-users") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description="차단된 사용자는 거래, 커뮤니티, 메신저에서 공통으로 제한됩니다." />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <UserListContent type="blocked" emptyMessage="차단한 사용자가 없습니다." />
        </div>
      </div>
    );
  }

  if (section === "hidden-users") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description="숨김 처리한 사용자는 피드와 일부 목록 노출에서 제외됩니다." />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <UserListContent type="hidden" emptyMessage="숨긴 사용자가 없습니다." />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MyPageSectionHeader description="내 계정 상태와 주요 활동을 한눈에 확인합니다." />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="space-y-2">
          <p className="sam-text-body font-bold text-sam-fg">
            {profile.nickname?.trim() || "닉네임 없음"}
          </p>
          <p className="sam-text-helper text-sam-muted">
            {profile.email ?? "이메일 없음"}
          </p>
          <p className="sam-text-helper text-sam-muted">
            연락처 {profile.phone?.trim() || "미등록"} ·{" "}
            {contactFormal ? "인증 완료" : "인증 필요"}
          </p>
          <div className="pt-1">
            <MannerBatteryDisplay
              raw={mannerScore}
              size="sm"
              layout="inline"
              className="gap-1.5"
            />
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryBox
          label="진행중 거래"
          value={String(
            (overviewCounts.purchases ?? 0) + (overviewCounts.sales ?? 0),
          )}
        />
        <SummaryBox label="미확인 알림" value={notificationBadge ?? "0"} />
        <SummaryBox
          label="최근 주문 상태"
          value={storeAttentionSummary ?? "확인"}
        />
        <SummaryBox label="관심 사용자" value={favoriteBadge ?? "0"} />
      </div>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5">
      <p className="sam-text-helper text-sam-muted">{label}</p>
      <p className="mt-1 sam-text-body font-semibold tabular-nums text-sam-fg">{value}</p>
    </div>
  );
}
