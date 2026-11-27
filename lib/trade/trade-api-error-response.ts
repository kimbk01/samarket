/**
 * 거래 도메인 API 오류 응답 — 서버 전용 (언어 재감사 2026-11-27 · `docs/i18n-ssot.md` §3-3).
 * `{ ok:false, error:<code>, code:<code>, params? }` 만 보낸다. 화면 문구는 `lib/trade/trade-api-error-text.ts`.
 */
import { NextResponse } from "next/server";

export type TradeApiErrorParams = Record<string, string | number>;

export function tradeApiError(
  code: string,
  status: number,
  extra?: { params?: TradeApiErrorParams } & Record<string, unknown>
): NextResponse {
  return NextResponse.json({ ok: false, error: code, code, ...(extra ?? {}) }, { status });
}

const ERROR_CODE_SHAPE = /^[a-z][a-z0-9_]*$/;

/** 다른 모듈이 돌려준 오류 값이 코드 모양일 때만 code 로 싣는다(문장이면 code 없음) */
export function tradeErrorCodeOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return ERROR_CODE_SHAPE.test(v) ? v : undefined;
}
