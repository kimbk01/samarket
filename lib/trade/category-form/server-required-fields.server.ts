/**
 * 서버 필수 칸 검사 — API 경로 연결부 (판정은 `server-required-fields.ts` 순수 함수).
 * 1단계: 로그만 남기고 `null`(통과). 2단계(`TRADE_REQUIRED_FIELDS_ENFORCE`)에서만 400 응답을 돌려준다.
 * 구성을 못 읽으면 막지 않는다(사진 필수 검사 `isTradeImagesRequiredServer` 와 같은 기준).
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadUserAppLanguage } from "@/lib/i18n/load-user-app-language";
import { translate } from "@/lib/i18n/messages";
import { loadResolvedTradeCompositionByCategoryId } from "./load-composition-for-filter";
import {
  TRADE_REQUIRED_FIELDS_ENFORCE,
  findMissingRequiredTradeFields,
  findNewlyMissingRequiredTradeFields,
  logTradeRequiredFieldsWouldBlock,
} from "./server-required-fields";
import type { ResolvedTradeComposition } from "./types";

type Ctx = { userId: string; acceptLanguage: string | null };

async function respondOrPass(
  sb: SupabaseClient<any>,
  composition: ResolvedTradeComposition,
  route: "create" | "update",
  fields: string[],
  ctx: Ctx
): Promise<NextResponse | null> {
  if (fields.length === 0) return null;
  logTradeRequiredFieldsWouldBlock({ route, profileId: String(composition.profileId), fields });
  if (!TRADE_REQUIRED_FIELDS_ENFORCE) return null;
  const lang = await loadUserAppLanguage(sb, ctx.userId, ctx.acceptLanguage).catch(() => "en" as const);
  return NextResponse.json(
    {
      ok: false,
      error: translate(lang, "trade_write_err_required_fields"),
      code: "required_field_missing",
      fields,
    },
    { status: 400 }
  );
}

export async function checkTradeRequiredFieldsOnCreate(
  sb: SupabaseClient<any>,
  tradeCategoryId: string | null | undefined,
  row: Record<string, unknown>,
  ctx: Ctx
): Promise<NextResponse | null> {
  const composition = await loadResolvedTradeCompositionByCategoryId(sb, tradeCategoryId).catch(() => null);
  if (!composition) return null;
  return respondOrPass(sb, composition, "create", findMissingRequiredTradeFields(composition, row), ctx);
}

export async function checkTradeRequiredFieldsOnUpdate(
  sb: SupabaseClient<any>,
  tradeCategoryId: string | null | undefined,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  ctx: Ctx
): Promise<NextResponse | null> {
  const composition = await loadResolvedTradeCompositionByCategoryId(sb, tradeCategoryId).catch(() => null);
  if (!composition) return null;
  return respondOrPass(
    sb,
    composition,
    "update",
    findNewlyMissingRequiredTradeFields(composition, before, after),
    ctx
  );
}
