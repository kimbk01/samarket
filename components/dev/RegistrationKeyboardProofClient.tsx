"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { RegistrationPageShell } from "@/components/auth/RegistrationPageShell";
import { RegistrationStepHelp } from "@/components/auth/RegistrationStepLater";
import { RegistrationAddressStep } from "@/components/auth/RegistrationAddressStep";
import { PhoneVerificationBox, type RegistrationPhoneStepKind } from "@/components/mypage/profile/PhoneVerificationBox";
import { MARKETING_CONSENT_DEFAULT } from "@/lib/legal/marketing-consent-default";
import { AuthConsentForm } from "@/components/auth/AuthConsentForm";
import { AddressPlatformDetailClient } from "@/components/addresses/AddressPlatformDetailClient";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
import { MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS } from "@/lib/addresses/mypage-address-manage-layout";

/** 주소 저장 화면 확인용 고정 위치(마닐라 마카티) — 서버 조회 없음 */
const PROOF_ADDRESS_DRAFT: CanonicalAddressDraft = {
  countryCode: "PH",
  latitude: 14.5547,
  longitude: 121.0244,
  placeId: null,
  placeName: null,
  placeTypes: [],
  streetNumber: "6750",
  route: "Ayala Avenue",
  streetAddress: "6750 Ayala Avenue",
  barangay: "San Lorenzo",
  cityMunicipality: "Makati",
  province: "Metro Manila",
  postalCode: "1226",
  neighborhoodName: null,
  formattedAddress: "6750 Ayala Ave, Makati, Metro Manila",
  identitySource: "geocoder_poi",
  samePlaceAsPreferred: false,
};

/**
 * 가입 단계 키보드·하단 버튼 기기 확인 — 로컬 전용(`app/dev/registration-keyboard`, 운영 404).
 * `?s=consent` 동의 · `?s=phone` 번호 입력 · `?s=code` 인증번호 6칸 · `?s=address-step` 주소 안내 · `?s=address` 주소 저장.
 * 전화 단계 조합은 `RegistrationPhoneStep` 과 같다(서버 조회만 가짜 회원 상태로 대신).
 */
export function RegistrationKeyboardProofClient() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const s = sp.get("s");
  const step = s === "code" ? "code" : "phone";
  const [future] = useState(() => new Date(Date.now() + 10 * 60_000).toISOString());
  const snapshot = {
    phone: null,
    phone_verified: false,
    settings: {
      enabled: true,
      guide_text: "",
      resend_cooldown_seconds: 60,
      country_dial_codes: ["+63", "+82"],
      default_dial_code: "+63",
      pending_challenge:
        step === "code" ? { phone: "+639171234567", expires_at: future, resend_available_at: future } : null,
    },
  };
  if (s === "address-step") {
    return (
      <div className="min-h-screen bg-sam-app">
        <RegistrationAddressStep next="/home" />
      </div>
    );
  }
  if (s === "consent") {
    return (
      <div className="min-h-screen bg-sam-app">
        <AuthConsentForm
          requiredVersions={{ termsVersion: "proof", privacyVersion: "proof" }}
          marketing={{ version: "proof", title: { ko: MARKETING_CONSENT_DEFAULT.ko.title, en: MARKETING_CONSENT_DEFAULT.en.title } }}
          consentGap="terms_privacy_and_age"
        />
      </div>
    );
  }
  if (s === "address") {
    return (
      <div className="flex h-[100dvh] flex-col" data-testid="registration-keyboard-proof-address">
        <div className={MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS} data-form-keyboard-surface="1">
          <div className="flex h-14 shrink-0 items-center border-b border-sam-border px-4 font-semibold">{t("addr_ui_add_title")}</div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <AddressPlatformDetailClient
              mode="create"
              initial={null}
              draft={PROOF_ADDRESS_DRAFT}
              allAddresses={[]}
              onSaved={() => {}}
            />
          </div>
        </div>
      </div>
    );
  }
  return <ProofPhoneStep snapshot={snapshot} />;
}

/** `RegistrationPhoneStep` 과 같은 조합 — 서버 조회만 가짜 회원 상태 */
function ProofPhoneStep({ snapshot }: { snapshot: Parameters<typeof PhoneVerificationBox>[0]["snapshot"] }) {
  const { t } = useI18n();
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);
  const [regStep, setRegStep] = useState<RegistrationPhoneStepKind>("phone");
  const countryBackRef = useRef<(() => void) | null>(null);
  return (
    <RegistrationPageShell
      topTitle={regStep === "country" ? t("my_phone_tg_country_title") : undefined}
      onTopBack={regStep === "country" ? () => countryBackRef.current?.() : undefined}
      exit={regStep === "done" ? null : "signup_cancel"}
      primarySlotRef={setActionSlot}
    >
      <PhoneVerificationBox
        snapshot={snapshot}
        onRefreshProfile={async () => {}}
        onDone={() => {}}
        registration={{
          title: t("auth_reg_phone_title"),
          description: t("auth_reg_phone_intro"),
          actionSlot,
          onStepChange: setRegStep,
          countryBackRef,
        }}
      />
      {regStep === "phone" ? <RegistrationStepHelp /> : null}
    </RegistrationPageShell>
  );
}
