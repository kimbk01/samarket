"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AddressDefaultsSummary } from "@/components/addresses/AddressDefaultsSummary";
import { AddressRowCard } from "@/components/addresses/AddressRowCard";
import { AddressEditorSheet } from "@/components/addresses/AddressEditorSheet";

export function AddressManagementClient() {
  const { tt } = useI18n();
  const [list, setList] = useState<UserAddressDTO[]>([]);
  const [defaults, setDefaults] = useState<UserAddressDefaultsDTO | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<UserAddressDTO | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const [a, d] = await Promise.all([
        fetch("/api/me/addresses", { credentials: "include" }),
        fetch("/api/me/address-defaults", { credentials: "include" }),
      ]);
      const aj = (await a.json()) as { ok?: boolean; addresses?: UserAddressDTO[]; error?: string };
      const dj = (await d.json()) as { ok?: boolean; defaults?: UserAddressDefaultsDTO; error?: string };
      if (!a.ok || !aj.ok) {
        setLoadErr(typeof aj.error === "string" ? aj.error : tt("목록을 불러오지 못했어요."));
        return;
      }
      setList(aj.addresses ?? []);
      if (d.ok && dj.ok && dj.defaults) setDefaults(dj.defaults);
    } catch {
      setLoadErr(tt("네트워크 오류가 났어요."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchDefaults(id: string, patch: Record<string, boolean>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/addresses/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(typeof j.error === "string" ? j.error : tt("기본값 변경 실패"));
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function removeRow(id: string) {
    if (!confirm(tt("이 주소를 삭제할까요?"))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/addresses/${id}`, { method: "DELETE", credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(typeof j.error === "string" ? j.error : tt("삭제 실패"));
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    setEditorMode("create");
    setEditTarget(null);
    setEditorOpen(true);
  }

  function openEdit(row: UserAddressDTO) {
    setEditorMode("edit");
    setEditTarget(row);
    setEditorOpen(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={tt("주소 관리")}
        subtitle={tt("생활·거래·배달 기본 주소")}
        backHref="/mypage"
        section="orders"
      />
      <div className="mx-auto max-w-lg space-y-5 px-4 py-4 pb-28 md:max-w-3xl">
        <p className="text-[13px] leading-relaxed text-gray-600">
          {tt("생활·동네, 중고거래, 배달에 쓰는 주소를 한곳에서 관리해요. 대표 주소와 용도별 기본값을 각각 지정할 수 있어요.")}
        </p>

        <AddressDefaultsSummary defaults={defaults} />

        {loadErr ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] text-amber-950">
            {loadErr}
            <p className="mt-2 text-[12px] text-amber-900/90">
              Supabase에 <code className="rounded bg-white/60 px-1">user_addresses</code> 마이그레이션을 적용했는지
              확인해 주세요.
            </p>
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-gray-900">{tt("저장된 주소")}</h2>
            <span className="text-[11px] text-gray-500">{tt("라디오: 대표 주소")}</span>
          </div>
          {list.length === 0 && !loadErr ? (
            <p className="rounded-xl border border-dashed border-gray-200 bg-white py-8 text-center text-[13px] text-gray-500">
              {tt("등록된 주소가 없어요. 아래에서 추가해 주세요.")}
            </p>
          ) : (
            <ul className="space-y-3">
              {list.map((row) => (
                <AddressRowCard
                  key={row.id}
                  row={row}
                  busyId={busyId}
                  onEdit={() => openEdit(row)}
                  onDelete={() => void removeRow(row.id)}
                  onSetDefault={(patch) => void patchDefaults(row.id, patch)}
                />
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="w-full rounded-2xl border-2 border-dashed border-gray-200 py-3.5 text-[14px] font-semibold text-gray-700"
        >
          {tt("+ 주소 추가")}
        </button>
      </div>

      <AddressEditorSheet
        open={editorOpen}
        mode={editorMode}
        initial={editTarget}
        onClose={() => setEditorOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
