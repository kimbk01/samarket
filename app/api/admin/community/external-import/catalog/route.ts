import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { SEA_COUNTRY_CODES } from "@/lib/external-import/countries";
import { getSiteAdapter } from "@/lib/external-import/adapters/registry";
import { resolveExternalSiteProductStatus } from "@/lib/external-import/product-status";
import type { BoardCapabilities } from "@/lib/external-import/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COUNTRY_LABELS: Record<string, { ko: string; en: string }> = {
  PH: { ko: "필리핀", en: "Philippines" },
  TH: { ko: "태국", en: "Thailand" },
  VN: { ko: "베트남", en: "Vietnam" },
  MY: { ko: "말레이시아", en: "Malaysia" },
  ID: { ko: "인도네시아", en: "Indonesia" },
  SG: { ko: "싱가포르", en: "Singapore" },
  KH: { ko: "캄보디아", en: "Cambodia" },
  LA: { ko: "라오스", en: "Laos" },
  MM: { ko: "미얀마", en: "Myanmar" },
  BN: { ko: "브루나이", en: "Brunei" },
  TL: { ko: "동티모르", en: "Timor-Leste" },
};

function boardCapabilities(adapterKey: string, boardKey: string): BoardCapabilities {
  try {
    const adapter = getSiteAdapter(adapterKey);
    const boards = adapter.listBoards();
    const list = Array.isArray(boards) ? boards : [];
    const hit = list.find((b) => b.boardKey === boardKey);
    if (hit?.capabilities) return hit.capabilities;
  } catch {
    /* fall through */
  }
  return {
    supportsRecent: true,
    supportsPageRange: false,
    supportsDateRange: false,
    recentCounts: [10, 20, 50],
  };
}

function rangeOptionsFromCapabilities(caps: BoardCapabilities): string[] {
  const out: string[] = [];
  if (caps.supportsRecent) {
    for (const n of caps.recentCounts ?? [10, 20, 50]) {
      out.push(`recent_${n}`);
    }
  }
  if (caps.supportsPageRange) out.push("page_range");
  if (caps.supportsDateRange) out.push("date_range");
  return out;
}

function operatorBoardName(boardKey: string, fallback: string): string {
  if (boardKey === "sharing") return "정보공유";
  if (boardKey === "wp_posts_all") return "전체 게시물";
  if (/^wp_/i.test(boardKey) || /CPT|REST|fixture/i.test(fallback)) return "게시판";
  return fallback;
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = getSupabaseServer();

  const { data: sites } = await sb
    .from("external_sites")
    .select("id, country_code, site_key, name, base_url, engine, adapter_key, is_active, updated_at")
    .order("name");

  const { data: boards } = await sb
    .from("external_boards")
    .select("id, site_id, board_key, name, list_url, topic_hint, is_active, updated_at")
    .eq("is_active", true)
    .order("name");

  const siteRows = (sites ?? []).map((s) => {
    const status = resolveExternalSiteProductStatus({
      adapterKey: s.adapter_key,
      isActive: Boolean(s.is_active),
    });
    return { ...s, productStatus: status };
  });

  const boardRows = (boards ?? []).filter((b) => {
    const site = siteRows.find((s) => s.id === b.site_id);
    return site && site.is_active;
  });

  const countries = SEA_COUNTRY_CODES.map((code) => {
    const countrySites = siteRows.filter(
      (s) => s.country_code === code && s.productStatus === "USABLE"
    );
    return {
      code,
      nameKo: COUNTRY_LABELS[code]?.ko ?? code,
      nameEn: COUNTRY_LABELS[code]?.en ?? code,
      usableSiteCount: countrySites.length,
    };
  });

  return NextResponse.json({
    ok: true,
    countries,
    sites: siteRows
      .filter((s) => s.is_active)
      .map((s) => ({
        id: s.id,
        countryCode: s.country_code,
        name: s.name,
        languageHint: s.country_code === "PH" ? "ko/en" : null,
        loginRequired: s.productStatus === "LOGIN_REQUIRED",
        status: s.productStatus,
        // engine is never operator eligibility — omitted from product contract
        boardCount: boardRows.filter((b) => b.site_id === s.id).length,
        lastCheckedAt: s.updated_at,
        selectable: s.productStatus === "USABLE",
      })),
    boards: boardRows.map((b) => {
      const site = siteRows.find((s) => s.id === b.site_id);
      const caps = boardCapabilities(String(site?.adapter_key || ""), b.board_key);
      return {
        id: b.id,
        siteId: b.site_id,
        boardKey: b.board_key,
        name: operatorBoardName(b.board_key, b.name),
        topicHint: b.topic_hint,
        lastCheckedAt: b.updated_at,
        capabilities: caps,
        rangeOptions: rangeOptionsFromCapabilities(caps),
      };
    }),
  });
}
