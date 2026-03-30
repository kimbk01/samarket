"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { philifeOpenChatRoomsUrl } from "@/lib/philife/api";
import { philifeAppPaths } from "@/lib/philife/paths";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { useMyNotificationUnreadCount } from "@/hooks/useMyNotificationUnreadCount";

export function OpenChatCreatePage() {
  const router = useRouter();
  const notificationUnreadCount = useMyNotificationUnreadCount();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerNickname, setOwnerNickname] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [allowSearch, setAllowSearch] = useState(true);
  const [maxMembers, setMaxMembers] = useState(300);
  const [entryQuestion, setEntryQuestion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch(philifeOpenChatRoomsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          ownerNickname,
          visibility,
          requiresApproval,
          allowSearch: visibility === "public" ? allowSearch : false,
          maxMembers,
          entryQuestion,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; room?: { id: string }; error?: string; message?: string };
      if (!res.ok || !json.ok || !json.room?.id) {
        setError(json.message || json.error || "오픈채팅방을 만들지 못했습니다.");
        return;
      }
      router.replace(philifeAppPaths.openChatRoom(json.room.id));
    } catch {
      setError("오픈채팅방을 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <MySubpageHeader
        title="커뮤니티"
        subtitle="오픈채팅 만들기"
        backHref={philifeAppPaths.openChat}
        preferHistoryBack
        hideCtaStrip
        showHubQuickActions
        notificationUnreadCount={notificationUnreadCount}
      />

      <div className={`${APP_MAIN_GUTTER_X_CLASS} pt-2`}>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <Field label="방 제목">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 마닐라 직장인 수다방"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
              maxLength={80}
              required
            />
          </Field>

          <Field label="방 소개">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="방 분위기와 주제를 간단히 적어 주세요."
              className="min-h-28 w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
              maxLength={1000}
            />
          </Field>

          <Field label="내 방 닉네임">
            <input
              value={ownerNickname}
              onChange={(e) => setOwnerNickname(e.target.value)}
              placeholder="비워두면 기본 닉네임 사용"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
              maxLength={24}
            />
          </Field>

          <Field label="공개 범위">
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton active={visibility === "public"} onClick={() => setVisibility("public")}>
                공개방
              </ToggleButton>
              <ToggleButton active={visibility === "private"} onClick={() => setVisibility("private")}>
                비공개방
              </ToggleButton>
            </div>
          </Field>

          <Field label="최대 인원">
            <input
              type="number"
              min={2}
              max={2000}
              value={maxMembers}
              onChange={(e) => setMaxMembers(Number(e.target.value) || 300)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
            />
          </Field>

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 px-3 py-3 text-[14px] text-gray-700">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            <span>참여 전에 관리자 승인을 받도록 설정</span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 px-3 py-3 text-[14px] text-gray-700">
            <input
              type="checkbox"
              checked={allowSearch}
              onChange={(e) => setAllowSearch(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
              disabled={visibility === "private"}
            />
            <span>검색 결과에 방 노출하기</span>
          </label>

          <Field label="입장 질문">
            <textarea
              value={entryQuestion}
              onChange={(e) => setEntryQuestion(e.target.value)}
              placeholder="승인제일 때 물어볼 질문이 있으면 적어 주세요."
              className="min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-signature"
              maxLength={500}
            />
          </Field>

          {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-signature px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? "생성 중..." : "오픈채팅방 만들기"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[13px] font-semibold text-gray-800">{label}</span>
      {children}
    </label>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-[14px] font-medium ${
        active ? "border-signature bg-signature/10 text-signature" : "border-gray-200 bg-white text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
