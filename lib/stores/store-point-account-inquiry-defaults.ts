import type { AppLanguageCode } from "@/lib/i18n/config";

/** Server-side copy for one-click account inquiry (stored in DB, not UI key exposure). */
export function buildStorePointAccountInquiryCopy(language: AppLanguageCode): {
  subject: string;
  content: string;
} {
  if (language === "en") {
    return {
      subject: "Store point top-up — deposit account request",
      content:
        "Please share the bank / GCash / Maya account details for store point top-up. I will submit a deposit request after receiving your reply.",
    };
  }
  return {
    subject: "매장 포인트 충전 입금 계좌 문의",
    content:
      "매장 포인트 충전을 위한 입금 계좌(GCash·Maya·은행) 안내를 요청합니다. 답변 확인 후 입금 신청을 진행하겠습니다.",
  };
}
