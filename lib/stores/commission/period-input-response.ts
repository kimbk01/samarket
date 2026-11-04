/**
 * 돈 화면 API 공통 — 잘못된 기간 입력이면 400 `invalid_period` (재감사 D-12·D-16).
 * 판정은 `storeCommissionPeriodInputError`(순수 · 화면과 같은 규칙). 서버 전용(`next/server`).
 */
import { NextResponse } from "next/server";
import { storeCommissionPeriodInputError } from "@/lib/stores/commission/store-commission-ledger-query";

export function invalidPeriodResponse(sp: Pick<URLSearchParams, "get">): NextResponse | null {
  return storeCommissionPeriodInputError(sp)
    ? NextResponse.json({ ok: false, error: "invalid_period" }, { status: 400 })
    : null;
}
