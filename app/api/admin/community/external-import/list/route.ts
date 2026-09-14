import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { fetchPhilsamoTravelList } from "@/lib/community-operator-import/philsamo-travel";
import { PHILSAMO_SOURCE_SITE, PHILSAMO_TRAVEL_BOARD, PHILSAMO_TRAVEL_LABEL } from "@/lib/community-operator-import/types";
import { jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;

  const page = Number(req.nextUrl.searchParams.get("page") || "1") || 1;
  const source = (req.nextUrl.searchParams.get("source") || PHILSAMO_SOURCE_SITE).trim();
  const board = (req.nextUrl.searchParams.get("board") || PHILSAMO_TRAVEL_BOARD).trim();

  if (source !== PHILSAMO_SOURCE_SITE || board !== PHILSAMO_TRAVEL_BOARD) {
    return jsonError("현재는 필사모 · 필리핀 여행 게시판만 지원합니다.", 400, { code: "source_board_unsupported" });
  }

  try {
    const rows = await fetchPhilsamoTravelList(Math.max(1, Math.min(20, page)));
    return jsonOk({
      source: {
        site: PHILSAMO_SOURCE_SITE,
        siteLabel: "필사모",
        board: PHILSAMO_TRAVEL_BOARD,
        boardLabel: PHILSAMO_TRAVEL_LABEL,
        boardUrl: "https://philsamo.com/bbs/board.php?bo_table=travel",
      },
      page,
      rows,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "목록 수집에 실패했습니다.", 502, {
      code: "list_fetch_failed",
    });
  }
}
