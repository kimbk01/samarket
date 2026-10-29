"use client";

/**
 * 안전장치 S2 — 매장 상세·입점 심사 「노출 메뉴」 (메뉴 관리 매장 지정과 같은 데이터).
 * 지정 메뉴가 없으면 업종 기본 메뉴를 미리 체크해 둔다 — 관리자가 저장만 누르면 최소 1개.
 * 노출 중인 매장은 0개로 저장할 수 없다 (서버·DB 도 거부).
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { clearStoresTaxonomyClientCache } from "@/lib/stores/store-delivery-api-client";

type MenuOption = { id: string; name_ko: string; root_name: string };

export function AdminStoreDeliveryMenusRow({ storeId, ko }: { storeId: string; ko: boolean }) {
  const [menus, setMenus] = useState<MenuOption[] | null>(null);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(storeId)}/delivery-menus`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        unavailable?: boolean;
        menus?: MenuOption[];
        assigned?: string[];
        default_menu_id?: string | null;
      };
      if (!j.ok) return;
      if (j.unavailable) {
        setUnavailable(true);
        return;
      }
      const a = j.assigned ?? [];
      setMenus(j.menus ?? []);
      setAssigned(a);
      setDefaultId(j.default_menu_id ?? null);
      setChecked(a.length ? a : j.default_menu_id ? [j.default_menu_id] : []);
    } catch {
      /* 표시만 생략 — 노출 켜기는 서버가 다시 검사 */
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (unavailable) return null;
  if (!menus) return <span className="text-[13px] text-sam-muted">{ko ? "불러오는 중" : "Loading"}</span>;

  const dirty = checked.slice().sort().join(",") !== assigned.slice().sort().join(",");
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(storeId)}/delivery-menus`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu_ids: checked }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) {
        await dibayAlert({
          title:
            j.error === "delivery_menu_required"
              ? ko
                ? "노출 매장은 메뉴를 1개 이상 골라야 합니다."
                : "A visible store needs at least one menu."
              : ko
                ? `저장하지 못했습니다. (${j.error ?? res.status})`
                : `Could not save. (${j.error ?? res.status})`,
        });
      }
      clearStoresTaxonomyClientCache();
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5" data-admin-store-delivery-menus>
      {assigned.length === 0 ?
        <p className="text-[12px] font-semibold text-sam-danger">
          {ko
            ? "메뉴 미지정 — 업종 기본 메뉴가 미리 선택되어 있습니다. 저장해 주세요."
            : "No menu yet — the category default is pre-selected. Save it."}
        </p>
      : null}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {menus.map((m) => (
          <label key={m.id} className="inline-flex items-center gap-1 text-[13px] text-sam-fg">
            <input
              type="checkbox"
              checked={checked.includes(m.id)}
              onChange={() => setChecked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}
            />
            <span className="text-sam-muted">{m.root_name}·</span>
            {m.name_ko}
            {m.id === defaultId ? <span className="text-[12px] text-sam-muted">{ko ? "(기본)" : "(default)"}</span> : null}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <AdminActionButton size="sm" variant="primary" disabled={busy || !dirty || checked.length === 0} onClick={() => void save()}>
          {adminCta("save", ko)}
        </AdminActionButton>
        <Link href="/admin/delivery-menus" className="text-[12px] text-sam-primary underline">
          {ko ? "메뉴 관리" : "Delivery menus"}
        </Link>
      </div>
    </div>
  );
}
