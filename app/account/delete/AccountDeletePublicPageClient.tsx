"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_HOME_ACCOUNT_LEAVE_HREF } from "@/lib/mypage/mypage-home-hub-links";

/**
 * Google Play web account-deletion resource (guest-accessible).
 * Does not delete without auth — explains path + email request.
 */
export function AccountDeletePublicPageClient() {
  const { safeT } = useI18n();

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8" data-account-delete-public="1">
      <h1 className="text-2xl font-semibold text-sam-fg">
        {safeT("ui_finish_account_delete_title", {
          fallbackKo: "DIBAY 계정 삭제 요청",
          fallbackEn: "DIBAY account deletion request",
        })}
      </h1>
      <p className="mt-3 sam-text-body leading-relaxed text-sam-fg">
        {safeT("account_delete_public_intro", {
          fallbackKo:
            "DIBAY(dibaY) 앱 계정을 만든 이용자는 계정과 관련 개인정보의 삭제를 요청할 수 있습니다. 본 페이지는 Google Play 등에서 앱을 설치하지 않은 상태에서도 삭제 요청 방법을 안내합니다.",
          fallbackEn:
            "Users who created a DIBAY (dibaY) account can request deletion of the account and related personal data. This page explains how to request deletion even without reinstalling the app (for example from Google Play).",
        })}
      </p>

      <h2 className="mt-8 text-lg font-semibold text-sam-fg">
        {safeT("account_delete_public_how_title", {
          fallbackKo: "삭제 요청 방법",
          fallbackEn: "How to request deletion",
        })}
      </h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 sam-text-body text-sam-fg">
        <li>
          {safeT("account_delete_public_how_1", {
            fallbackKo:
              "아래 「계정 삭제 계속」을 눌러 DIBAY에 로그인한 뒤, 내정보/설정의 계정 삭제 화면에서 요청을 제출합니다.",
            fallbackEn:
              "Tap Continue below, sign in to DIBAY, then submit a request from My / Settings → account deletion.",
          })}
        </li>
        <li>
          {safeT("account_delete_public_how_2", {
            fallbackKo:
              "앱을 사용할 수 없는 경우 support@dibay.app 로 계정 삭제 요청을 보내 주세요. 본인 확인을 위해 가입에 사용한 로그인 방식(Google/Apple/Kakao 등)과 닉네임·이메일을 함께 적어 주세요.",
            fallbackEn:
              "If you cannot use the app, email support@dibay.app to request account deletion. Include your sign-in method (Google/Apple/Kakao, etc.) and nickname/email for identity verification.",
          })}
        </li>
      </ol>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/login?next=${encodeURIComponent(MYPAGE_HOME_ACCOUNT_LEAVE_HREF)}`}
          className="inline-flex items-center justify-center rounded-ui-rect bg-signature px-4 py-2.5 text-sm font-medium text-white"
        >
          {safeT("account_delete_public_cta_login", {
            fallbackKo: "계정 삭제 계속 (로그인)",
            fallbackEn: "Continue account deletion (sign in)",
          })}
        </Link>
        <a
          href="mailto:support@dibay.app?subject=DIBAY%20account%20deletion%20request"
          className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border px-4 py-2.5 text-sm font-medium text-sam-fg"
        >
          {safeT("account_delete_public_cta_email", {
            fallbackKo: "이메일로 요청 (support@dibay.app)",
            fallbackEn: "Email request (support@dibay.app)",
          })}
        </a>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-sam-fg">
        {safeT("ui_account_delete_data_title", {
          fallbackKo: "삭제 시 사라지는 정보",
          fallbackEn: "What will be removed",
        })}
      </h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 sam-text-body text-sam-fg">
        <li>
          {safeT("ui_account_delete_data_1", {
            fallbackKo: "프로필 표시 정보와 연락처, 로그인 연결 정보",
            fallbackEn: "Profile, contact info, and sign-in connections",
          })}
        </li>
        <li>
          {safeT("ui_account_delete_data_2", {
            fallbackKo: "찜, 관심 사용자, 개인 설정값",
            fallbackEn: "Saved items, favorite users, and personal settings",
          })}
        </li>
        <li>
          {safeT("ui_account_delete_data_3", {
            fallbackKo: "서비스 내 개인화 상태",
            fallbackEn: "In-app personalization state",
          })}
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-sam-fg">
        {safeT("account_delete_public_retain_title", {
          fallbackKo: "보관될 수 있는 정보",
          fallbackEn: "Data that may be retained",
        })}
      </h2>
      <p className="mt-3 sam-text-body leading-relaxed text-sam-fg">
        {safeT("account_delete_public_retain_body", {
          fallbackKo:
            "거래·주문·신고·정산·감사·법령상 의무 이행에 필요한 기록은 목적 달성까지 보관될 수 있습니다. 자세한 내용은 개인정보처리방침을 확인하세요.",
          fallbackEn:
            "Records needed for trades, orders, reports, settlement, auditing, or legal duties may be kept until those purposes end. See the Privacy Policy for details.",
        })}{" "}
        <Link href="/privacy" className="text-signature underline">
          {safeT("mypage_comp_settings_privacy_link", {
            fallbackKo: "개인정보처리방침",
            fallbackEn: "Privacy policy",
          })}
        </Link>
      </p>

      <p className="mt-8 text-xs text-sam-meta">
        {safeT("account_delete_public_in_app", {
          fallbackKo: "앱 내 경로: 내정보 → 설정 → 계정 삭제 (/mypage/section/settings/leave)",
          fallbackEn: "In-app path: My → Settings → account deletion (/mypage/section/settings/leave)",
        })}
      </p>
    </div>
  );
}
