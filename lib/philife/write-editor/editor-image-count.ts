/**
 * 편집기 사진 수 — 저장 기준(`mergePostBodyImages`: 같은 주소는 1장)과 같은 규칙 (Owner 승인 2026-11-02 · 재감사 불일치 3).
 *
 * - 업로드가 끝난 사진(주소 있음)은 주소로 한 번만 센다.
 * - 업로드 중·실패(아직 주소 없음)는 사진 칸마다 1장으로 센다(같은 파일인지 알 수 없다).
 */
export type EditorImageCountAttrs = { status?: unknown; src?: unknown };

/** 업로드가 끝나 저장 대상이 되는 주소 — 아니면 null */
export function editorImageDoneSrc(a: EditorImageCountAttrs): string | null {
  if (a.status === "uploading" || a.status === "failed") return null;
  const src = typeof a.src === "string" ? a.src.trim() : "";
  return src || null;
}

export class EditorImageCounter {
  private readonly done = new Set<string>();
  private pendingCount = 0;

  /** 사진 칸 1개를 더하고, 실제로 1장이 늘었으면 true */
  add(a: EditorImageCountAttrs): boolean {
    const src = editorImageDoneSrc(a);
    if (src === null) {
      this.pendingCount += 1;
      return true;
    }
    if (this.done.has(src)) return false;
    this.done.add(src);
    return true;
  }

  /** 이 사진 칸을 더하면 장수가 늘어나는지(같은 주소가 이미 있으면 false) */
  wouldAdd(a: EditorImageCountAttrs): boolean {
    const src = editorImageDoneSrc(a);
    return src === null || !this.done.has(src);
  }

  get total(): number {
    return this.done.size + this.pendingCount;
  }
}
