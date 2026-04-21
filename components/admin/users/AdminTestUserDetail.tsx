"use client";

import Link from "next/link";
import { useAdminMemberUuidVisibility } from "@/hooks/useAdminMemberUuidVisibility";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { formatPhMobileDisplay } from "@/lib/utils/ph-mobile";
import { AdminUserPointsSection } from "./AdminUserPointsSection";

export type ApiTestUserRow = {
  id: string;
  username: string | null;
  email?: string | null;
  role: string;
  display_name: string | null;
  nickname?: string | null;
  contact_phone?: string | null;
  contact_address?: string | null;
  phone_verified?: boolean;
  phone_verification_status?: string;
  created_at: string | null;
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
  const { showMemberUuid, setShowMemberUuid } = useAdminMemberUuidVisibility();
  const display =
    user.nickname?.trim() || user.display_name?.trim() || user.username || (showMemberUuid ? user.id : "—");

  return (
    <div className="space-y-4">
      <AdminPageHeader title="회원 상세 (아이디 로그인)" backHref="/admin/users" />

      <AdminCard title="회원 계정">
        <dl className="grid gap-3 sam-text-body">
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">로그인 아이디</dt>
            <dd className="mt-0.5 font-mono sam-text-body font-semibold text-sam-fg">{user.username ?? "—"}</dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">닉네임</dt>
            <dd className="mt-0.5 text-sam-fg">{display}</dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">이메일</dt>
            <dd className="mt-0.5 text-sam-fg">{user.email?.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">회원 UUID (DB PK)</dt>
            <dd className="mt-0.5 sam-text-body-secondary text-sam-fg">
              {showMemberUuid ? (
                <>
                  <span className="break-all font-mono sam-text-helper">{user.id}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button
                      type="button"
                      className="sam-text-helper font-medium text-signature hover:underline"
                      onClick={() => {
                        void navigator.clipboard.writeText(user.id).catch(() => {});
                      }}
                    >
                      UUID 복사
                    </button>
                    <button
                      type="button"
                      className="sam-text-helper font-medium text-sam-muted hover:underline"
                      onClick={() => setShowMemberUuid(false)}
                    >
                      숨기기
                    </button>
                  </div>
                </>
              ) : (
                <span className="text-sam-muted">
                  숨김{" "}
                  <button
                    type="button"
                    className="font-medium text-signature hover:underline"
                    onClick={() => setShowMemberUuid(true)}
                  >
                    표시
                  </button>
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">권한(role)</dt>
            <dd className="mt-0.5 text-sam-fg">{roleLabelKo(user.role)}</dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">전화번호 인증</dt>
            <dd className="mt-0.5 text-sam-fg">
              {user.phone_verified ? "완료" : user.phone_verification_status === "pending" ? "승인 대기" : "미인증"}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">등록일</dt>
            <dd className="mt-0.5 text-sam-fg">
              {user.created_at ? new Date(user.created_at).toLocaleString("ko-KR") : "—"}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">연락처 (수동 입력)</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sam-fg">
              {user.contact_phone?.trim() ? (
                contactPhoneDisplay(user.contact_phone)
              ) : (
                <span className="text-sam-meta">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">주소 (수동 입력)</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sam-fg">
              {user.contact_address?.trim() ? (
                user.contact_address.trim()
              ) : (
                <span className="text-sam-meta">—</span>
              )}
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard title="전화번호 인증 처리">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/phone-verification`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "approve" }),
              });
              const data = await res.json().catch(() => null);
              if (!res.ok || !data?.ok) {
                alert(data?.error || "승인 실패");
                return;
              }
              window.location.reload();
            }}
            className="rounded bg-signature px-4 py-2 sam-text-body-secondary font-medium text-white"
          >
            전화 인증 승인
          </button>
          <button
            type="button"
            onClick={async () => {
              const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/phone-verification`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "reset" }),
              });
              const data = await res.json().catch(() => null);
              if (!res.ok || !data?.ok) {
                alert(data?.error || "초기화 실패");
                return;
              }
              window.location.reload();
            }}
            className="rounded border border-sam-border px-4 py-2 sam-text-body-secondary font-medium text-sam-fg"
          >
            인증 초기화
          </button>
        </div>
      </AdminCard>

      <AdminUserPointsSection userId={user.id} />

      <AdminCard title="로그인·테스트 안내">
        <ul className="list-disc space-y-2 pl-5 sam-text-body-secondary leading-relaxed text-sam-fg">
          <li>
            <Link href="/login" className="text-signature underline">
              로그인 페이지
            </Link>
            의 <strong>이메일 또는 아이디</strong> 칸에 로그인 아이디(또는 전체 이메일)와 비밀번호를 넣거나,{" "}
            <Link href="/my" className="text-signature underline">
              내 정보
            </Link>
            의 보조 로그인으로 들어가면 매장·주문 API가 이 UUID와 연결됩니다.
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
