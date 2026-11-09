/**
 * 사장님 운영 공지 — 클라이언트 조회 (배달 오픈 4단계 · Owner 2026-11-10).
 * 서버 계약: `GET /api/me/stores/announcements` · `GET|POST /api/me/stores/announcements/[id](/view)`.
 */
export type OwnerAnnouncementListItemDto = {
  id: string;
  title: string;
  isPinned: boolean;
  audience: "store_owners" | "store_owners_approved";
  createdAt: string;
  read: boolean;
  isNew: boolean;
};

export type OwnerAnnouncementDetailDto = {
  id: string;
  title: string;
  body: string;
  heroImageUrl: string | null;
  authorLabel: string;
  isPinned: boolean;
  createdAt: string;
  read: boolean;
  /** 목록 순서 기준 이웃 공지 (확인 창 「이전·다음 공지」) */
  prev?: { id: string; title: string } | null;
  next?: { id: string; title: string } | null;
};

export type OwnerAnnouncementsListResult =
  | { ok: true; announcements: OwnerAnnouncementListItemDto[] }
  | { ok: false; error: string; status: number };

export async function fetchOwnerAnnouncements(opts?: {
  limit?: number;
  latest?: boolean;
}): Promise<OwnerAnnouncementsListResult> {
  const sp = new URLSearchParams();
  if (opts?.limit) sp.set("limit", String(opts.limit));
  if (opts?.latest) sp.set("latest", "1");
  const qs = sp.toString();
  try {
    const res = await fetch(`/api/me/stores/announcements${qs ? `?${qs}` : ""}`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      announcements?: OwnerAnnouncementListItemDto[];
    };
    if (!res.ok || !j.ok || !Array.isArray(j.announcements)) {
      return { ok: false, error: j.error ?? "load_failed", status: res.status };
    }
    return { ok: true, announcements: j.announcements };
  } catch {
    return { ok: false, error: "network_error", status: 0 };
  }
}

export type OwnerAnnouncementDetailResult =
  | { ok: true; unavailable: false; notice: OwnerAnnouncementDetailDto }
  | { ok: true; unavailable: true; title: string; message: string; messageEn: string }
  | { ok: false; error: string; status: number };

export async function fetchOwnerAnnouncementDetail(noticeId: string): Promise<OwnerAnnouncementDetailResult> {
  try {
    const res = await fetch(`/api/me/stores/announcements/${encodeURIComponent(noticeId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      unavailable?: boolean;
      message?: string;
      messageEn?: string;
      notice?: Partial<OwnerAnnouncementDetailDto> & { id?: string; title?: string };
    };
    if (!res.ok || !j.ok || !j.notice) {
      return { ok: false, error: j.error ?? "load_failed", status: res.status };
    }
    if (j.unavailable) {
      return {
        ok: true,
        unavailable: true,
        title: String(j.notice.title ?? ""),
        message: String(j.message ?? ""),
        messageEn: String(j.messageEn ?? ""),
      };
    }
    return { ok: true, unavailable: false, notice: j.notice as OwnerAnnouncementDetailDto };
  } catch {
    return { ok: false, error: "network_error", status: 0 };
  }
}

/** 열람 기록 — 실패해도 화면은 그대로(읽음 표시만 다음 조회에 반영 안 됨) */
export async function recordOwnerAnnouncementView(noticeId: string): Promise<void> {
  try {
    await fetch(`/api/me/stores/announcements/${encodeURIComponent(noticeId)}/view`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* 열람 기록 실패는 화면에 영향 없음 */
  }
}
