"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";

export function AccountSettingsContent() {
  const user = getCurrentUser();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] text-gray-500">이메일</p>
        <p className="text-[15px] text-gray-900">{user?.email ?? "—"}</p>
      </div>
      <div>
        <p className="text-[12px] text-gray-500">전화번호</p>
        <p className="text-[15px] text-gray-900">등록된 전화번호 없음</p>
      </div>
      <div>
        <p className="text-[12px] text-gray-500">본인 인증</p>
        <p className="text-[15px] text-gray-900">미인증</p>
      </div>
      <p className="text-[13px] text-gray-500">변경은 추후 연동됩니다.</p>
    </div>
  );
}
