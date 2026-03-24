"use client";

import { TestLoginBar } from "@/components/auth/TestLoginBar";
import { isTestUsersSurfaceEnabled } from "@/lib/config/test-users-surface";

/** 관리자 수동 가입(test_users) 아이디 로그인 — API 쿠키·sessionStorage 동기화 */
export function MyTestLoginSection() {
  if (!isTestUsersSurfaceEnabled()) return null;

  return (
    <section className="space-y-2" aria-label="아이디 로그인">
      <h2 className="px-1 text-[13px] font-medium text-gray-500">아이디 로그인</h2>
      <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
        <TestLoginBar />
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-gray-400">
        관리자「회원 관리 → 수동 입력」으로 만든 로그인 아이디로 접속하면 매장·주문 API가 해당 회원 UUID와
        연결됩니다. 여러 계정을 동시에 쓰려면 브라우저(또는 프로필·시크릿)를 나누세요.
      </p>
    </section>
  );
}
