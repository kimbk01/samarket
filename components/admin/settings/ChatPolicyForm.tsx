"use client";

import type { AppSettings } from "@/lib/types/admin-settings";

interface ChatPolicyFormProps {
  values: Pick<
    AppSettings,
    "chatEnabled" | "allowChatAfterSold" | "maxMessageLength"
  >;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function ChatPolicyForm({ values, onChange }: ChatPolicyFormProps) {
  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        채팅 정책 (6단계 연동 placeholder)
      </p>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="chatEnabled"
          checked={values.chatEnabled}
          onChange={(e) => onChange("chatEnabled", e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="chatEnabled" className="sam-text-body text-sam-fg">
          채팅 사용
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="allowChatAfterSold"
          checked={values.allowChatAfterSold}
          onChange={(e) => onChange("allowChatAfterSold", e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="allowChatAfterSold" className="sam-text-body text-sam-fg">
          판매 완료 후 채팅 허용
        </label>
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">
          최대 메시지 길이
        </label>
        <input
          type="number"
          min={1}
          value={values.maxMessageLength}
          onChange={(e) =>
            onChange("maxMessageLength", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
    </div>
  );
}
