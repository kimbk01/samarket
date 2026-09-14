import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  isSupportedPhilsamoBoard,
  listPhilsamoBoards,
  PHILSAMO_SITE,
  philsamoBoardUrl,
  resolvePhilsamoBoard,
} from "@/lib/community-operator-import/boards";
import { fetchPhilsamoTravelList } from "@/lib/community-operator-import/philsamo-travel";
import { PHILSAMO_SOURCE_SITE, PHILSAMO_TRAVEL_BOARD } from "@/lib/community-operator-import/types";
import { jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;

  const page = Number(req.nextUrl.searchParams.get("page") || "1") || 1;
  const source = (req.nextUrl.searchParams.get("source") || PHILSAMO_SOURCE_SITE).trim();
  const board = (req.nextUrl.searchParams.get("board") || PHILSAMO_TRAVEL_BOARD).trim();

  if (source !== PHILSAMO_SOURCE_SITE || !isSupportedPhilsamoBoard(board)) {
    return jsonError("지원하지 않는 출처/게시판입니다.", 400, { code: "source_board_unsupported" });
  }

  const boardDef = resolvePhilsamoBoard(board)!;
  try {
    const rows = await fetchPhilsamoTravelList(Math.max(1, Math.min(20, page)), boardDef.board);
    return jsonOk({
      source: {
        site: PHILSAMO_SITE.site,
        siteLabel: PHILSAMO_SITE.siteLabel,
        board: boardDef.board,
        boardLabel: boardDef.labelKo,
        boardUrl: philsamoBoardUrl(boardDef.board),
      },
      boards: listPhilsamoBoards(),
      page,
      rows,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "목록 수집에 실패했습니다.", 502, {
      code: "list_fetch_failed",
    });
  }
}
