/**
 * 서버 필수 칸 검사 — API 경로 연결부 (판정은 `server-required-fields.ts` 순수 함수).
 * 1단계: 로그만 남기고 `null`(통과). 2단계(`TRADE_REQUIRED_FIELDS_ENFORCE`)에서만 400 응답을 돌려준다.
 * 구성을 못 읽으면 막지 않는다(사진 필수 검사 `isTradeImagesRequiredServer` 와 같은 기준).
 * 응답은 코드만 — `error`·`code` = `required_field_missing`, 빠진 칸은 `fields`·`params.field`(첫 칸).
 * 문구는 화면이 `TRADE_WRITE_ERROR_KEYS`(`trade-api-error-text.ts`)로 고른다 (사후 검토 M6 2026-11-27).
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadResolvedTradeCompositionByCategoryId } from "./load-composition-for-filter";
import {
  TRADE_REQUIRED_FIELDS_ENFORCE,
  findMissingRequiredTradeFields,
  findNewlyMissingRequiredTradeFields,
  logTradeRequiredFieldsWouldBlock,
} from "./server-required-fields";
import type { ResolvedTradeComposition } from "./types";

/** 호출처 호환용(언어는 더 읽지 않는다 — 응답이 코드만이라서) */
type Ctx = { userId: string; acceptLanguage: string | null };

function respondOrPass(
  composition: ResolvedTradeComposition,
  route: "create" | "update",
  fields: string[]
): NextResponse | null {
  if (fields.length === 0) return null;
  logTradeRequiredFieldsWouldBlock({ route, profileId: String(composition.profileId), fields });
  if (!TRADE_REQUIRED_FIELDS_ENFORCE) return null;
  return NextResponse.json(
    {
      ok: false,
      error: "required_field_missing",
      code: "required_field_missing",
      fields,
      params: { field: fields[0]! },
    },
    { status: 400 }
  );
}

export async function checkTradeRequiredFieldsOnCreate(
  sb: SupabaseClient<any>,
  tradeCategoryId: string | null | undefined,
  row: Record<string, unknown>,
  _ctx: Ctx
): Promise<NextResponse | null> {
  const composition = await loadResolvedTradeCompositionByCategoryId(sb, tradeCategoryId).catch(() => null);
  if (!composition) return null;
  return respondOrPass(composition, "create", findMissingRequiredTradeFields(composition, row));
}

export async function checkTradeRequiredFieldsOnUpdate(
  sb: SupabaseClient<any>,
  tradeCategoryId: string | null | undefined,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  _ctx: Ctx
): Promise<NextResponse | null> {
  const composition = await loadResolvedTradeCompositionByCategoryId(sb, tradeCategoryId).catch(() => null);
  if (!composition) return null;
  return respondOrPass(composition, "update", findNewlyMissingRequiredTradeFields(composition, before, after));
}
