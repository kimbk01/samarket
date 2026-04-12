"use client";

/** 댓글 입력 — CommunityDetail 내부 폼과 동일 동작이 필요하면 상위에서 위임 */
export function CommunityCommentForm({
  placeholder = "댓글을 입력하세요",
  disabled,
  onSubmit,
}: {
  placeholder?: string;
  disabled?: boolean;
  onSubmit?: (text: string) => void;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const t = String(fd.get("c") ?? "").trim();
        if (t) {
          onSubmit?.(t);
          form.reset();
        }
      }}
    >
      <input
        name="c"
        disabled={disabled}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-ui-rect bg-sam-ink px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
      >
        등록
      </button>
    </form>
  );
}
