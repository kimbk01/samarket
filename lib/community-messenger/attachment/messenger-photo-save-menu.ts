/**
 * 메신저 사진 저장 메뉴 — 순수 로직(길게 누른 앨범 칸 식별 · 메뉴 구성 · 선택 저장 순서).
 * UI(`MessageLongPressPopover`, `MessengerPhotoSelectSaveSheet`, `MessengerChatImageBubble`)는 이 모듈만 따른다.
 */
import type { MessengerImageSaveMode } from "@/lib/community-messenger/attachment/messenger-image-save";

/** 앨범 칸 DOM 표식 — 값은 앨범 표시 순서 인덱스. 단일 사진은 0. */
export const MESSENGER_ALBUM_INDEX_ATTR = "data-album-index";
/** 5장 이상 앨범의 「+N」 칸 — 특정 사진을 가리키지 않는다(앨범 인덱스 없음). */
export const MESSENGER_ALBUM_REST_ATTR = "data-album-rest";

/**
 * 5장 이상 앨범에서 4번째 칸(「+N」 오버레이)은 urls[3] 을 보여 준다 —
 * 탭하면 같은 사진(인덱스 3)부터 뷰어를 연다(이어서 넘겨 보기).
 */
export const MESSENGER_ALBUM_REST_TILE_INDEX = 3;

type ClosestCapable = { closest?: (selector: string) => { getAttribute(name: string): string | null } | null };

/**
 * 길게 누르기 시작 지점(event.target)에서 눌린 앨범 칸 인덱스를 찾는다.
 * 「+N」 칸·말풍선 여백·사진이 아닌 곳이면 undefined.
 */
export function extractMessengerAlbumIndexFromTarget(target: unknown): number | undefined {
  if (!target || typeof target !== "object") return undefined;
  const closest = (target as ClosestCapable).closest;
  if (typeof closest !== "function") return undefined;
  let cell: { getAttribute(name: string): string | null } | null = null;
  try {
    cell = closest.call(target, `[${MESSENGER_ALBUM_INDEX_ATTR}]`);
  } catch {
    return undefined;
  }
  if (!cell) return undefined;
  const raw = cell.getAttribute(MESSENGER_ALBUM_INDEX_ATTR);
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

export type MessengerPhotoSaveMenuRow =
  | { key: "photo-save"; kind: "single"; urls: string[] }
  | { key: "photo-save-this"; kind: "this"; urls: string[]; index: number }
  | { key: "photo-save-all"; kind: "all"; urls: string[]; count: number }
  | { key: "photo-save-select"; kind: "select"; preselectIndex?: number };

/**
 * 길게 누르기 메뉴의 사진 저장 행.
 * - 단일 사진: 「사진 저장」
 * - 앨범 + 눌린 사진: 「이 사진 저장」·「사진 모두 저장 (N장)」·「사진 선택해서 저장」
 * - 앨범 + 인덱스 없음(「+N」 칸·여백): 「사진 모두 저장 (N장)」·「사진 선택해서 저장」
 * - 브라우저 모드(구버전 앱): 한 장씩만 — 단일 「사진 저장」 또는 「이 사진 저장」만.
 * - 저장 미지원(none)·저장할 사진 없음: 행 없음.
 *
 * @param slots 앨범 칸별 원본 URL(`messengerImageOriginalUrlSlots`) — 저장 불가 칸은 "".
 */
export function buildMessengerPhotoSaveMenu(input: {
  slots: string[];
  mode: MessengerImageSaveMode;
  albumIndex?: number;
}): MessengerPhotoSaveMenuRow[] {
  const { slots, mode } = input;
  if (mode === "none") return [];
  const savable = slots.filter(isHttpUrl);
  if (savable.length === 0) return [];
  if (slots.length <= 1) return [{ key: "photo-save", kind: "single", urls: savable }];

  const idx = input.albumIndex;
  const pressed =
    typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < slots.length && isHttpUrl(slots[idx] ?? "")
      ? idx
      : undefined;

  const rows: MessengerPhotoSaveMenuRow[] = [];
  if (pressed !== undefined) rows.push({ key: "photo-save-this", kind: "this", urls: [slots[pressed]!], index: pressed });
  if (mode === "browser") return rows;
  rows.push({ key: "photo-save-all", kind: "all", urls: savable, count: savable.length });
  rows.push({ key: "photo-save-select", kind: "select", ...(pressed !== undefined ? { preselectIndex: pressed } : {}) });
  return rows;
}

/** 선택 저장 — 선택한 칸의 원본을 앨범 순서대로(선택 순서 무관). 저장 불가 칸은 제외. */
export function messengerSelectedOriginalUrls(slots: string[], selected: Iterable<number>): string[] {
  const set = new Set(selected);
  return slots.filter((u, i) => set.has(i) && isHttpUrl(u));
}
