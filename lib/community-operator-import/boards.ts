/** Bounded Philsamo board registry — Fresh operator import (not a generic crawler). */

export type PhilsamoBoardDef = {
  board: string;
  labelKo: string;
  /** Human-facing short label in Admin LEFT */
  shortLabel: string;
};

export const PHILSAMO_SITE = {
  site: "philsamo" as const,
  siteLabel: "필사모",
  baseUrl: "https://philsamo.com",
};

/**
 * Proven / compatible Gnuboard boards only.
 * travel = original PHASE B/E proof; food/news/free = Production list HTML proved wr_id rows.
 */
export const PHILSAMO_BOARDS: readonly PhilsamoBoardDef[] = [
  { board: "travel", labelKo: "필리핀 여행", shortLabel: "여행" },
  { board: "food", labelKo: "맛집·음식", shortLabel: "맛집" },
  { board: "news", labelKo: "필리핀 뉴스", shortLabel: "뉴스" },
  { board: "free", labelKo: "자유게시판", shortLabel: "자유" },
] as const;

export function listPhilsamoBoards(): PhilsamoBoardDef[] {
  return [...PHILSAMO_BOARDS];
}

export function resolvePhilsamoBoard(board: string | null | undefined): PhilsamoBoardDef | null {
  const key = String(board || "").trim().toLowerCase();
  if (!key) return null;
  return PHILSAMO_BOARDS.find((b) => b.board === key) || null;
}

export function isSupportedPhilsamoBoard(board: string | null | undefined): boolean {
  return resolvePhilsamoBoard(board) != null;
}

export function philsamoBoardUrl(board: string): string {
  return `${PHILSAMO_SITE.baseUrl}/bbs/board.php?bo_table=${encodeURIComponent(board)}`;
}
