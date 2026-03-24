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
      <p className="text-[13px] text-gray-500">
        채팅 정책 (6단계 연동 placeholder)
      </p>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="chatEnabled"
          checked={values.chatEnabled}
          onChange={(e) => onChange("chatEnabled", e.target.checked)}
          className="rounded border-gray-300"
        />
        <label htmlFor="chatEnabled" className="text-[14px] text-gray-700">
          채팅 사용
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="allowChatAfterSold"
          checked={values.allowChatAfterSold}
          onChange={(e) => onChange("allowChatAfterSold", e.target.checked)}
          className="rounded border-gray-300"
        />
        <label htmlFor="allowChatAfterSold" className="text-[14px] text-gray-700">
          판매 완료 후 채팅 허용
        </label>
      </div>
      <div>
        <label className="block text-[13px] font-medium text-gray-700">
          최대 메시지 길이
        </label>
        <input
          type="number"
          min={1}
          value={values.maxMessageLength}
          onChange={(e) =>
            onChange("maxMessageLength", Number(e.target.value) || 0)
          }
          className="mt-1 w-full max-w-xs rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
        />
      </div>
    </div>
  );
}
