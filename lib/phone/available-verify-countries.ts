import "server-only";
import { isSolapiSmsConfigured } from "@/lib/env/solapi-sms";

/** 서버 판정 — +63(Semaphore) 항상, +82 는 Solapi 키·발신번호가 모두 있을 때만. */
export function resolveAvailableVerifyDialCodes(): string[] {
  return isSolapiSmsConfigured() ? ["+63", "+82"] : ["+63"];
}
