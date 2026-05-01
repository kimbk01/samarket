"use client";

import type { DevicePermissionKind } from "@/lib/permissions/device-permission-kind";
import { Sam } from "@/lib/ui/sam-component-classes";

const COPY: Record<
  DevicePermissionKind,
  { title: string; body: string; primary: string; secondary: string }
> = {
  location: {
    title: "위치 권한을 허용할까요?",
    body: "거래 위치, 주변 상품, 배달 주소 확인에 사용됩니다.",
    primary: "허용하기",
    secondary: "나중에",
  },
  microphone: {
    title: "마이크 권한을 허용할까요?",
    body: "음성 통화, 음성 메시지 기능에 사용됩니다.",
    primary: "허용하기",
    secondary: "나중에",
  },
  speaker: {
    title: "소리 출력을 확인해 주세요",
    body: "채팅 알림음과 통화음을 들을 수 있는지 테스트합니다.",
    primary: "소리 테스트",
    secondary: "나중에",
  },
};

export function PermissionGuideModal({
  kind,
  onLater,
  onPrimary,
}: {
  kind: DevicePermissionKind;
  onLater: () => void;
  onPrimary: () => void;
}) {
  const c = COPY[kind];
  return (
    <div
      className="fixed inset-0 z-[126] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`dibay-perm-guide-${kind}`}
    >
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        <h2 id={`dibay-perm-guide-${kind}`} className={`${Sam.text.sectionTitle} text-sam-fg`}>
          {c.title}
        </h2>
        <p className={`mt-3 ${Sam.text.bodySecondary} leading-relaxed text-sam-muted`}>{c.body}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" className={`${Sam.btn.primaryCombo} ${Sam.btn.block} min-h-[48px]`} onClick={onPrimary}>
            {c.primary}
          </button>
          <button type="button" className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} min-h-[48px]`} onClick={onLater}>
            {c.secondary}
          </button>
        </div>
      </div>
    </div>
  );
}
