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
  const { t, language, safeT } = useI18n();
  const ko = language !== "en";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {safeT("admin_legal_consent_policy")}
        </h1>
        <Link href="/admin/app/legal" className="sam-text-body text-signature">
          {t("admin_app_legal_list")}
        </Link>
      </div>
      <p className="rounded-ui-rect bg-sam-surface p-3 sam-text-body text-sam-muted">
        {t("admin_app_do_not_flip_required_optional_via")}
      </p>
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-sam-surface-muted">
            <tr>
              <th className="px-3 py-2">{t("admin_app_item")}</th>
              <th className="px-3 py-2">{t("admin_app_role")}</th>
              <th className="px-3 py-2">{t("admin_app_signup")}</th>
              <th className="px-3 py-2">{t("admin_app_my_info")}</th>
              <th className="px-3 py-2">{t("admin_app_reconsent")}</th>
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
