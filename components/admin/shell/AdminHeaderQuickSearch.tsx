"use client";

/**
 * 상단 고정 영역 「공통 조회·빠른 작업」 (지시서 §6 · 재설계 R8) — 회원(닉네임·ID)·주문(주문번호)을 한 번에 조회한다.
 * 기존 관리자 API 만 쓴다 (새 DB 객체 없음):
 *  - 회원: `/api/admin/users?search=` (회원 목록과 같은 검색 필터) → 상세 `/admin/users/{id}` · 목록 `/admin/users?search=`
 *  - 주문: `/api/admin/store-orders/ops?screen=list&q=` (주문 목록과 같은 RPC) → 목록 `/admin/stores/orders?q=`
 * 권한: 접근표로 열 수 없는 화면은 조회하지 않는다.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

const RESULT_LIMIT = 5;

type MemberHit = { id: string; nickname: string; handle: string | null };
type OrderHit = { id: string; orderNo: string; storeName: string };
type Section<T> = { status: "ok"; items: T[]; total: number } | { status: "failed" } | { status: "off" };

export function adminQuickSearchMembersHref(q: string): string {
  return `/admin/users?${new URLSearchParams({ search: q }).toString()}`;
}

export function adminQuickSearchOrdersHref(q: string): string {
  return `/admin/stores/orders?${new URLSearchParams({ q }).toString()}`;
}

async function fetchMembers(q: string, signal: AbortSignal): Promise<Section<MemberHit>> {
  const qs = new URLSearchParams({ search: q, page: "1", pageSize: String(RESULT_LIMIT) });
  const res = await fetch(`/api/admin/users?${qs.toString()}`, { credentials: "include", cache: "no-store", signal });
  const json = (await res.json().catch(() => null)) as {
    users?: Array<{ id?: string; nickname?: string; dibay_id?: string | null; username?: string | null }>;
    summary?: { totalRows?: number };
  } | null;
  if (!res.ok || !json || !Array.isArray(json.users)) return { status: "failed" };
  const items = json.users.slice(0, RESULT_LIMIT).map((u) => ({
    id: String(u.id ?? ""),
    nickname: String(u.nickname ?? "").trim() || "—",
    handle: (u.dibay_id ?? u.username ?? "").trim() || null,
  }));
  return { status: "ok", items, total: Number(json.summary?.totalRows ?? items.length) || items.length };
}

async function fetchOrders(q: string, signal: AbortSignal): Promise<Section<OrderHit>> {
  const qs = new URLSearchParams({ screen: "list", q, page_size: String(RESULT_LIMIT) });
  const res = await fetch(`/api/admin/store-orders/ops?${qs.toString()}`, { credentials: "include", cache: "no-store", signal });
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    rows?: Array<{ id?: string; order_no?: string; store_name?: string }>;
    total?: number;
  } | null;
  if (!res.ok || !json || json.ok !== true || !Array.isArray(json.rows)) return { status: "failed" };
  const items = json.rows.slice(0, RESULT_LIMIT).map((r) => ({
    id: String(r.id ?? ""),
    orderNo: String(r.order_no ?? ""),
    storeName: String(r.store_name ?? ""),
  }));
  return { status: "ok", items, total: Number(json.total ?? items.length) || items.length };
}

export function AdminHeaderQuickSearch({
  canSearchMembers,
  canSearchOrders,
}: {
  canSearchMembers: boolean;
  canSearchOrders: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Section<MemberHit>>({ status: "off" });
  const [orders, setOrders] = useState<Section<OrderHit>>({ status: "off" });

  const close = useCallback(() => {
    setOpen(false);
    abortRef.current?.abort();
  }, []);

  // 화면 이동·바깥 클릭·Esc → 닫기
  useEffect(() => {
    close();
  }, [pathname, close]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q || (!canSearchMembers && !canSearchOrders)) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setSubmitted(q);
      setOpen(true);
      setLoading(true);
      const safe = <T,>(p: Promise<Section<T>>): Promise<Section<T>> =>
        p.catch(() => ({ status: "failed" }) as Section<T>);
      const [m, o] = await Promise.all([
        canSearchMembers ? safe(fetchMembers(q, ac.signal)) : Promise.resolve<Section<MemberHit>>({ status: "off" }),
        canSearchOrders ? safe(fetchOrders(q, ac.signal)) : Promise.resolve<Section<OrderHit>>({ status: "off" }),
      ]);
      if (ac.signal.aborted) return;
      setMembers(m);
      setOrders(o);
      setLoading(false);
    },
    [query, canSearchMembers, canSearchOrders]
  );

  if (!canSearchMembers && !canSearchOrders) return null;

  const sectionCls = "border-b border-[var(--admin-console-border)] py-1.5 last:border-b-0";
  const headCls = "flex h-7 items-center justify-between gap-2 px-2 text-[12px] font-semibold text-[var(--admin-console-muted)]";
  const rowCls =
    "flex h-9 items-center gap-2 rounded-ui-rect px-2 text-[13px] text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)]";

  return (
    <div ref={rootRef} className="relative shrink-0" data-admin-quick-search="1">
      <form role="search" onSubmit={onSubmit} className="flex items-center gap-1">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("admin_shell_search_label")}
          placeholder={t("admin_shell_search_placeholder")}
          className="h-9 w-40 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2 text-[13px] text-[var(--admin-console-fg)] placeholder:text-[var(--admin-console-muted)] min-[1280px]:w-56"
          maxLength={60}
        />
        <AdminActionButton type="submit" variant="secondary" size="sm" disabled={!query.trim()}>
          {t("admin_shell_search_submit")}
        </AdminActionButton>
      </form>
      {open ? (
        <div
          className="absolute left-0 z-50 mt-1 w-80 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] p-1 shadow-lg"
          data-admin-quick-search-results="1"
        >
          {loading ? (
            <p className="px-2 py-3 text-[13px] text-[var(--admin-console-muted)]">{t("admin_shell_search_loading")}</p>
          ) : (
            <>
              {members.status !== "off" ? (
                <section className={sectionCls} data-admin-quick-search-section="members">
                  <header className={headCls}>
                    <span>{t("admin_shell_search_members")}</span>
                    {members.status === "ok" ? (
                      <Link href={adminQuickSearchMembersHref(submitted)} prefetch={false} className="underline" onClick={close}>
                        {t("admin_shell_search_all_members", { n: members.total })}
                      </Link>
                    ) : null}
                  </header>
                  {members.status === "failed" ? (
                    <p className="px-2 py-1 text-[12px] text-sam-warning">{t("admin_shell_search_failed")}</p>
                  ) : members.items.length === 0 ? (
                    <p className="px-2 py-1 text-[12px] text-[var(--admin-console-muted)]">{t("admin_shell_search_none")}</p>
                  ) : (
                    <ul>
                      {members.items.map((m) => (
                        <li key={m.id}>
                          <Link href={`/admin/users/${encodeURIComponent(m.id)}`} prefetch={false} className={rowCls} onClick={close}>
                            <span className="min-w-0 flex-1 truncate">{m.nickname}</span>
                            {m.handle ? (
                              <span className="shrink-0 text-[12px] text-[var(--admin-console-muted)]">@{m.handle}</span>
                            ) : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}
              {orders.status !== "off" ? (
                <section className={sectionCls} data-admin-quick-search-section="orders">
                  <header className={headCls}>
                    <span>{t("admin_shell_search_orders")}</span>
                    {orders.status === "ok" ? (
                      <Link href={adminQuickSearchOrdersHref(submitted)} prefetch={false} className="underline" onClick={close}>
                        {t("admin_shell_search_all_orders", { n: orders.total })}
                      </Link>
                    ) : null}
                  </header>
                  {orders.status === "failed" ? (
                    <p className="px-2 py-1 text-[12px] text-sam-warning">{t("admin_shell_search_failed")}</p>
                  ) : orders.items.length === 0 ? (
                    <p className="px-2 py-1 text-[12px] text-[var(--admin-console-muted)]">{t("admin_shell_search_none")}</p>
                  ) : (
                    <ul>
                      {orders.items.map((o) => (
                        <li key={o.id}>
                          <Link href={adminQuickSearchOrdersHref(o.orderNo)} prefetch={false} className={rowCls} onClick={close}>
                            <span className="shrink-0 font-semibold tabular-nums">{o.orderNo || "—"}</span>
                            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--admin-console-muted)]">{o.storeName}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
