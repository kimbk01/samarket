"use client";

type Props = {
  onClose: () => void;
  onFriendChatStart: () => void;
  onFriendAdd: () => void;
  onCreateGroup: () => void;
  onFindOpenChat: () => void;
};

function SheetActionButton({
  label,
  helper,
  meta,
  onClick,
}: {
  label: string;
  helper: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-ui-rect border border-ui-border bg-ui-surface px-4 py-3 text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="sam-text-body font-medium text-ui-fg">{label}</p>
        <span className="rounded-ui-rect border border-ui-border bg-ui-page px-2 py-0.5 sam-text-xxs font-medium text-ui-muted">
          {meta}
        </span>
      </div>
      <p className="mt-1 sam-text-helper text-ui-muted">{helper}</p>
    </button>
  );
}

/** FAB 등에서 열리는 새 대화 진입 메뉴 */
export function MessengerNewConversationSheet({
  onClose,
  onFriendChatStart,
  onFriendAdd,
  onCreateGroup,
  onFindOpenChat,
}: Props) {
  return (
    <div className="fixed inset-0 z-[42] flex flex-col justify-end bg-black/25">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="rounded-t-[12px] border border-ui-border bg-ui-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--ui-shadow-card)]">
        <p className="text-center sam-text-body font-semibold text-ui-fg">새 대화</p>
        <p className="mt-3 text-center sam-text-helper text-ui-muted">새 대화 메뉴</p>
        <div className="mt-4 grid gap-2">
          <SheetActionButton
            label="친구와 대화 시작"
            helper="친구 탭에서 프로필을 연 뒤 대화합니다."
            meta="1"
            onClick={() => {
              onClose();
              onFriendChatStart();
            }}
          />
          <SheetActionButton
            label="친구 추가"
            helper="닉네임·아이디로 검색해 요청합니다."
            meta="2"
            onClick={() => {
              onClose();
              onFriendAdd();
            }}
          />
          <SheetActionButton
            label="그룹 만들기"
            helper="친구를 고른 비공개 그룹."
            meta="3"
            onClick={() => {
              onClose();
              onCreateGroup();
            }}
          />
          <SheetActionButton
            label="모임 찾기"
            helper="커뮤니티 모임 탐색·참여."
            meta="4"
            onClick={() => {
              onClose();
              onFindOpenChat();
            }}
          />
        </div>
        <button type="button" className="mt-3 w-full py-2 sam-text-body text-ui-muted" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}
