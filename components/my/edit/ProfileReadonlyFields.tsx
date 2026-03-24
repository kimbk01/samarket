import type { ProfileRow } from "@/lib/profile/types";

export interface ProfileReadonlyFieldsProps {
  profile: ProfileRow;
}

export function ProfileReadonlyFields({ profile }: ProfileReadonlyFieldsProps) {
  return (
    <div className="space-y-3 rounded-lg bg-gray-50 p-3">
      <p className="text-[12px] font-medium text-gray-500">읽기 전용</p>
      <div className="grid gap-2 text-[14px]">
        <div className="flex justify-between">
          <span className="text-gray-500">이메일</span>
          <span className="text-gray-900">{profile.email ?? "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">실명 인증</span>
          <span className="text-gray-900">{profile.realname_verified ? "완료" : "미인증"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">연락처 인증</span>
          <span className="text-gray-900">{profile.phone_verified ? "완료" : "미인증"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">회원 등급</span>
          <span className="text-gray-900">{profile.role}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">포인트</span>
          <span className="text-gray-900">{profile.points}</span>
        </div>
      </div>
    </div>
  );
}
