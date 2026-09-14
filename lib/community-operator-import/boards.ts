/**
 * Philsamo board helpers — backed by the verified multi-source registry.
 * Prefer `registry.ts` for new Admin/API wiring.
 */
import { listVerifiedBoards, resolveVerifiedBoard } from "./registry";

export type PhilsamoBoardDef = {
  board: string;
  labelKo: string;
  shortLabel: string;
};

export const PHILSAMO_SITE = {
  site: "philsamo" as const,
  siteLabel: "필사모",
  baseUrl: "https://philsamo.com",
};

export function listPhilsamoBoards(): PhilsamoBoardDef[] {
  return listVerifiedBoards("philsamo").map((b) => ({
    board: b.boardId,
    labelKo: b.displayName,
    shortLabel: b.shortLabel,
  }));
}

export function resolvePhilsamoBoard(board: string | null | undefined): PhilsamoBoardDef | null {
  const b = resolveVerifiedBoard("philsamo", board);
  if (!b) return null;
  return { board: b.boardId, labelKo: b.displayName, shortLabel: b.shortLabel };
}

export function isSupportedPhilsamoBoard(board: string | null | undefined): boolean {
  return resolvePhilsamoBoard(board) != null;
}

export function philsamoBoardUrl(board: string): string {
  return `${PHILSAMO_SITE.baseUrl}/bbs/board.php?bo_table=${encodeURIComponent(board)}`;
}
