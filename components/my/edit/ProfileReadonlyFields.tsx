import type { ProfileRow } from "@/lib/profile/types";
import { hasFormalMemberContactVerification } from "@/lib/auth/member-access";

export interface ProfileReadonlyFieldsProps {
  profile: ProfileRow;
}

export function ProfileReadonlyFields({ profile }: ProfileReadonlyFieldsProps) {
  const contactFormal = hasFormalMemberContactVerification({
    phone_verified: profile.phone_verified,
    auth_provider: profile.auth_provider,
    email: profile.email,
  });

  return (
    <div className="space-y-3 rounded-ui-rect bg-sam-app p-3">
      <p className="text-[12px] font-medium text-sam-muted">읽기 전용</p>
      <div className="grid gap-2 text-[14px]">
        <div className="flex justify-between">
          <span className="text-sam-muted">이메일</span>
          <span className="text-sam-fg">{profile.email ?? "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">실명 인증</span>
          <span className="text-sam-fg">{profile.realname_verified ? "완료" : "미인증"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">연락처 인증</span>
          <span className="text-sam-fg">
            {contactFormal
              ? "완료"
              : profile.phone_verification_status === "pending"
                ? "승인 대기"
                : "미인증"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">회원 등급</span>
          <span className="text-sam-fg">{profile.role}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">포인트</span>
          <span className="text-sam-fg">{profile.points}</span>
        </div>
      </div>
    </div>
  );
}
