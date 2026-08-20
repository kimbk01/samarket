"use client";

import { ProtoButton } from "./trade-prototype-ui";

export function TradePrototypeDeleteFlowMock({
  mode,
  onClose,
  listingTitle,
}: {
  mode: "none" | "soft" | "hard-preview" | "hard-confirm";
  onClose: () => void;
  listingTitle: string;
}) {
  if (mode === "none") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
      <div className="w-full max-w-md rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        {mode === "soft" ? (
          <>
            <h2 className="sam-text-section-title font-semibold text-sam-fg">운영 삭제</h2>
            <p className="mt-2 sam-text-body-secondary text-sam-muted">
              <strong>{listingTitle}</strong>을(를) 운영 삭제하시겠습니까?
            </p>
            <p className="mt-2 sam-text-body-secondary text-sam-muted">
              사용자 Marketplace에서는 더 이상 노출되지 않습니다. 거래·신고·채팅 등의 운영 기록은 보존됩니다.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <ProtoButton variant="ghost" onClick={onClose}>
                취소
              </ProtoButton>
              <ProtoButton variant="primary" onClick={onClose}>
                운영 삭제
              </ProtoButton>
            </div>
          </>
        ) : null}

        {mode === "hard-preview" ? (
          <>
            <h2 className="sam-text-section-title font-semibold text-red-800">영구 삭제 영향</h2>
            <p className="mt-1 sam-text-xxs text-sam-muted">NOT_READY — dependency query 미구현. 아래는 UX mock만.</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 sam-text-body-secondary">
              {[
                ["게시물", "1"],
                ["이미지", "6 (fixture)"],
                ["현재 찜", "—"],
                ["거래 광고", "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-ui-rect border border-sam-border-soft px-2 py-2">
                  <dt className="sam-text-xxs text-sam-muted">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 sam-text-xxs font-semibold text-sam-fg">보존 대상</p>
            <ul className="mt-1 list-inside list-disc sam-text-xxs text-sam-muted">
              <li>거래 채팅 · 신고 · 후기 · 포인트 원장</li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <ProtoButton variant="ghost" onClick={onClose}>
                취소
              </ProtoButton>
              <ProtoButton variant="danger" disabled title="dependency 계약 미완">
                다음 (비활성)
              </ProtoButton>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
