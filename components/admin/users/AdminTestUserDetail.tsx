"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { formatPhMobileDisplay } from "@/lib/utils/ph-mobile";

export type ApiTestUserRow = {
  id: string;
  username: string;
  role: string;
  display_name: string | null;
  contact_phone?: string | null;
  contact_address?: string | null;
  created_at: string;
};

function roleLabelKo(role: string): string {
  switch (role) {
    case "admin":
      return "관리자";
    case "master":
      return "최고 관리자";
    case "special":
      return "특별 회원";
    case "member":
      return "일반 회원";
    default:
      return role;
  }
}

function contactPhoneDisplay(raw: string | null | undefined): string {
  const t = raw?.trim() ?? "";
  if (!t) return "";
  const spaced = formatPhMobileDisplay(t);
  return spaced || t;
}

export function AdminTestUserDetail({ user }: { user: ApiTestUserRow }) {
  const display = user.display_name?.trim() || user.username;

  return (
    <div className="space-y-4">
      <AdminPageHeader title="회원 상세 (아이디 로그인)" backHref="/admin/users" />

      <AdminCard title="test_users 계정">
        <dl className="grid gap-3 text-[14px]">
          <div>
            <dt className="text-[12px] font-medium text-gray-500">로그인 아이디</dt>
            <dd className="mt-0.5 font-mono text-[15px] font-semibold text-gray-900">{user.username}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-gray-500">표시 이름</dt>
            <dd className="mt-0.5 text-gray-900">{display}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-gray-500">회원 UUID (DB PK)</dt>
            <dd className="mt-0.5 break-all font-mono text-[12px] text-gray-800">{user.id}</dd>
            <button
              type="button"
              className="mt-1 text-[12px] font-medium text-signature hover:underline"
              onClick={() => {
                void navigator.clipboard.writeText(user.id).catch(() => {});
              }}
            >
              UUID 복사
            </button>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-gray-500">권한(role)</dt>
            <dd className="mt-0.5 text-gray-900">{roleLabelKo(user.role)}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-gray-500">등록일</dt>
            <dd className="mt-0.5 text-gray-800">
              {new Date(user.created_at).toLocaleString("ko-KR")}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-gray-500">연락처 (수동 입력)</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-gray-900">
              {user.contact_phone?.trim() ? (
                contactPhoneDisplay(user.contact_phone)
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-gray-500">주소 (수동 입력)</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-gray-900">
              {user.contact_address?.trim() ? (
                user.contact_address.trim()
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard title="로그인·멀티 유저 테스트 안내">
        <ul className="list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-gray-700">
          <li>
            <Link href="/login" className="text-signature underline">
              로그인
            </Link>
            또는{" "}
            <Link href="/my" className="text-signature underline">
              내 정보
            </Link>
            상단「아이디 로그인」에서 위 <strong>로그인 아이디</strong>로 접속하면 매장·주문 API가 이 UUID와
            연결됩니다.
          </li>
          <li>
            동시에 여러 계정을 쓰려면 <strong>브라우저를 나누세요</strong>(예: Chrome vs Edge). 같은 브라우저
            프로필의 탭만 여러 개 쓰면 쿠키가 공유되어 한 명으로 섞일 수 있습니다.
          </li>
          <li>프로필 분리(Chrome 사용자별)나 일반 창+시크릿 창 조합도 서로 다른 사용자로 동작합니다.</li>
        </ul>
      </AdminCard>
    </div>
  );
}
