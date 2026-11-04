"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const ROWS: Array<{
  itemKo: string;
  itemEn: string;
  role: string;
  signup: string;
  my: string;
  reconsent: string;
}> = [
  {
    itemKo: "이용약관",
    itemEn: "Terms",
    role: "required",
    signup: "Y",
    my: "view",
    reconsent: "version",
  },
  {
    itemKo: "개인정보 수집·이용",
    itemEn: "Privacy collection",
    role: "required",
    signup: "Y",
    my: "view",
    reconsent: "version",
  },
  {
    itemKo: "만 14세 이상(생년월일) — 연령 정책 이후 가입 회원",
    itemEn: "Age 14+ (DOB) — members joined after the age policy",
    role: "required",
    signup: "Y",
    my: "history",
    reconsent: "N (pre-policy members exempt)",
  },
  {
    itemKo: "마케팅 수신",
    itemEn: "Marketing",
    role: "optional",
    signup: "Y (default OFF, first record only)",
    my: "Notification settings",
    reconsent: "keep prior",
  },
  {
    itemKo: "위치·거래·배달",
    itemEn: "Location / trade / delivery",
    role: "notice@feature",
    signup: "N",
    my: "OS / feature",
    reconsent: "N",
  },
];

/** Read-only consent role policy board (Owner mockup adminPolicy). */
export function AdminConsentPolicyPage() {
  const { language, safeT } = useI18n();
  const ko = language !== "en";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {safeT("admin_legal_consent_policy", {
            fallbackKo: "동의 정책",
            fallbackEn: "Consent policy",
          })}
        </h1>
        <Link href="/admin/app/legal" className="sam-text-body text-signature">
          {ko ? "약관 목록" : "Legal list"}
        </Link>
      </div>
      <p className="rounded-ui-rect bg-sam-surface p-3 sam-text-body text-sam-muted">
        {ko
          ? "필수↔선택 변경은 즉시 토글 금지. 법적 근거·사유·승인 후 코드/정책을 갱신합니다. 과거 consent_events 행을 고쳐 현재 동의를 위장하지 않습니다."
          : "Do not flip required↔optional via a live toggle. Update policy in code after legal review. Never rewrite past consent_events to fake current consent."}
      </p>
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-sam-surface-muted">
            <tr>
              <th className="px-3 py-2">{ko ? "항목" : "Item"}</th>
              <th className="px-3 py-2">{ko ? "유형" : "Role"}</th>
              <th className="px-3 py-2">{ko ? "가입" : "Signup"}</th>
              <th className="px-3 py-2">{ko ? "내정보" : "My Info"}</th>
              <th className="px-3 py-2">{ko ? "재동의" : "Reconsent"}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.itemEn} className="border-t border-sam-border">
                <td className="px-3 py-2 font-medium">{ko ? r.itemKo : r.itemEn}</td>
                <td className="px-3 py-2">{r.role}</td>
                <td className="px-3 py-2">{r.signup}</td>
                <td className="px-3 py-2">{r.my}</td>
                <td className="px-3 py-2">{r.reconsent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
