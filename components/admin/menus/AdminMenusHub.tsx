"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export function AdminMenusHub() {
  return (
    <div className="space-y-4">
      <AdminPageHeader title="메뉴 관리" description="거래와 커뮤니티 메뉴를 각각 관리합니다." />
      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Link
            href="/admin/menus/trade"
            className="block rounded-ui-rect border border-sam-border bg-sam-surface p-4 sam-text-body shadow-sm transition hover:border-signature/40 hover:bg-sam-app/80"
          >
            <span className="font-medium text-sam-fg">메뉴 (거래)</span>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">홈 상단 칩·거래 종류(일반·중고차 등)</p>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/menus/philife"
            className="block rounded-ui-rect border border-sam-border bg-sam-surface p-4 sam-text-body shadow-sm transition hover:border-signature/40 hover:bg-sam-app/80"
          >
            <span className="font-medium text-sam-fg">메뉴 (커뮤니티)</span>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">게시판형 글쓰기와 연결되는 런처 항목</p>
          </Link>
        </li>
        <li className="sm:col-span-2">
          <Link
            href="/admin/menus/main-bottom-nav"
            className="block rounded-ui-rect border border-sam-border bg-sam-surface p-4 sam-text-body shadow-sm transition hover:border-signature/40 hover:bg-sam-app/80"
          >
            <span className="font-medium text-sam-fg">메인 하단 탭</span>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">앱 하단 네비게이션 탭 설정</p>
          </Link>
        </li>
      </ul>
    </div>
  );
}
