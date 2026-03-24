import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { COMMERCE_SETTING_KEYS } from "@/lib/stores/commerce-settings-keys";
import { listCommerceSettingKeysInDb, loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import {
  getOrderMatchAlertSoundUrl,
  ORDER_MATCH_CHAT_ALERT_SOUND_KEY,
} from "@/lib/stores/order-match-alert-sound";
import { isValidStoreDeliverySoundUrlInput } from "@/lib/stores/store-delivery-alert-sound";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 관리자: 매장 커머스 수치(자동완료·정산) 조회 — DB+env 병합 결과 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const effective = await loadCommerceSettings(sb);
  const inDb = await listCommerceSettingKeysInDb(sb);
  const orderMatchSoundUrl = await getOrderMatchAlertSoundUrl(sb);

  return NextResponse.json({
    ok: true,
    effective: {
      store_auto_complete_days: effective.autoCompleteDays,
      store_settlement_fee_bp: effective.settlementFeeBp,
      store_settlement_delay_days: effective.settlementDelayDays,
    },
    order_match_chat_alert_sound_url: orderMatchSoundUrl,
    overridden_in_db: {
      store_auto_complete_days: inDb.has(COMMERCE_SETTING_KEYS.autoCompleteDays),
      store_settlement_fee_bp: inDb.has(COMMERCE_SETTING_KEYS.settlementFeeBp),
      store_settlement_delay_days: inDb.has(COMMERCE_SETTING_KEYS.settlementDelayDays),
      order_match_chat_alert_sound: orderMatchSoundUrl != null,
    },
  });
}

type PutBody = {
  store_auto_complete_days?: number | null;
  store_settlement_fee_bp?: number | null;
  store_settlement_delay_days?: number | null;
  /** 주문 채팅(일치 확인 등) 알림음 MP3/오디오 URL — null이면 DB 행 삭제 */
  order_match_chat_alert_sound_url?: string | null;
};

/** 관리자: 값 저장(null이면 해당 키 행 삭제 → env 기본값) */
export async function PUT(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const ops: { key: string; del: boolean; value?: number }[] = [];

  if ("store_auto_complete_days" in body) {
    const v = body.store_auto_complete_days;
    if (v === null) ops.push({ key: COMMERCE_SETTING_KEYS.autoCompleteDays, del: true });
    else if (v !== undefined) {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 1 || n > 90) {
        return NextResponse.json({ ok: false, error: "invalid_auto_complete_days" }, { status: 400 });
      }
      ops.push({ key: COMMERCE_SETTING_KEYS.autoCompleteDays, del: false, value: n });
    }
  }

  if ("store_settlement_fee_bp" in body) {
    const v = body.store_settlement_fee_bp;
    if (v === null) ops.push({ key: COMMERCE_SETTING_KEYS.settlementFeeBp, del: true });
    else if (v !== undefined) {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        return NextResponse.json({ ok: false, error: "invalid_settlement_fee_bp" }, { status: 400 });
      }
      ops.push({ key: COMMERCE_SETTING_KEYS.settlementFeeBp, del: false, value: n });
    }
  }

  if ("store_settlement_delay_days" in body) {
    const v = body.store_settlement_delay_days;
    if (v === null) ops.push({ key: COMMERCE_SETTING_KEYS.settlementDelayDays, del: true });
    else if (v !== undefined) {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 0 || n > 365) {
        return NextResponse.json({ ok: false, error: "invalid_settlement_delay_days" }, { status: 400 });
      }
      ops.push({ key: COMMERCE_SETTING_KEYS.settlementDelayDays, del: false, value: n });
    }
  }

  let soundTouched = false;
  if ("order_match_chat_alert_sound_url" in body) {
    soundTouched = true;
    const raw = body.order_match_chat_alert_sound_url;
    if (raw === null) {
      const { error: delE } = await sb.from("admin_settings").delete().eq("key", ORDER_MATCH_CHAT_ALERT_SOUND_KEY);
      if (delE && !delE.message?.includes("does not exist")) {
        console.error("[PUT commerce-settings sound delete]", delE);
        return NextResponse.json({ ok: false, error: delE.message }, { status: 500 });
      }
    } else if (raw !== undefined) {
      if (typeof raw !== "string") {
        return NextResponse.json({ ok: false, error: "invalid_order_match_sound_url" }, { status: 400 });
      }
      const t = raw.trim();
      if (t.length > 2048) {
        return NextResponse.json({ ok: false, error: "order_match_sound_url_too_long" }, { status: 400 });
      }
      if (t.length > 0 && !isValidStoreDeliverySoundUrlInput(t)) {
        return NextResponse.json({ ok: false, error: "invalid_order_match_sound_url" }, { status: 400 });
      }
      if (t.length === 0) {
        const { error: delE2 } = await sb.from("admin_settings").delete().eq("key", ORDER_MATCH_CHAT_ALERT_SOUND_KEY);
        if (delE2 && !delE2.message?.includes("does not exist")) {
          console.error("[PUT commerce-settings sound delete empty]", delE2);
          return NextResponse.json({ ok: false, error: delE2.message }, { status: 500 });
        }
      } else {
        const { error: upE } = await sb.from("admin_settings").upsert(
          {
            key: ORDER_MATCH_CHAT_ALERT_SOUND_KEY,
            value_json: { value: t },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
        if (upE) {
          if (upE.message?.includes("admin_settings") && upE.message?.includes("does not exist")) {
            return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
          }
          console.error("[PUT commerce-settings sound upsert]", upE);
          return NextResponse.json({ ok: false, error: upE.message }, { status: 500 });
        }
      }
    }
  }

  if (ops.length === 0 && !soundTouched) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  for (const op of ops) {
    if (op.del) {
      const { error } = await sb.from("admin_settings").delete().eq("key", op.key);
      if (error) {
        if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
          return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
        }
        console.error("[PUT commerce-settings delete]", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await sb.from("admin_settings").upsert(
        {
          key: op.key,
          value_json: { value: op.value },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
      if (error) {
        if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
          return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
        }
        console.error("[PUT commerce-settings upsert]", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    }
  }

  const effective = await loadCommerceSettings(sb);
  const inDb = await listCommerceSettingKeysInDb(sb);
  const orderMatchSoundUrlAfter = await getOrderMatchAlertSoundUrl(sb);

  const payload = {
    ok: true as const,
    effective: {
      store_auto_complete_days: effective.autoCompleteDays,
      store_settlement_fee_bp: effective.settlementFeeBp,
      store_settlement_delay_days: effective.settlementDelayDays,
    },
    order_match_chat_alert_sound_url: orderMatchSoundUrlAfter,
    overridden_in_db: {
      store_auto_complete_days: inDb.has(COMMERCE_SETTING_KEYS.autoCompleteDays),
      store_settlement_fee_bp: inDb.has(COMMERCE_SETTING_KEYS.settlementFeeBp),
      store_settlement_delay_days: inDb.has(COMMERCE_SETTING_KEYS.settlementDelayDays),
      order_match_chat_alert_sound: orderMatchSoundUrlAfter != null,
    },
  };

  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "commerce_settings",
    target_id: "global",
    action: "commerce_settings.update",
    after_json: payload as unknown as Record<string, unknown>,
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json(payload);
}
