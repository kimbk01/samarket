"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CrewRepPolicyPanel } from "./CrewRepPolicyPanel";

/**
 * 어드민 설정 「CREW REP 정책」 탭 — S7 (Owner 2026-11-16).
 * 저장할 설정 없음: 예전 「거래 후기 사용」·「매너 점수 노출」 스위치는 앱 어디에도 연결되지 않아(D10) 정리했다.
 * 정책 값은 코드 단일 정의(lib/trust/crew-rep-policy.ts)이며 바꾸려면 정책 버전을 올린다.
 */
export function TrustPolicyForm() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_crew_rep_intro")}</p>
      <CrewRepPolicyPanel />
    </div>
  );
}
