import { create } from "zustand";

/** 「사진 선택해서 저장」 시트 열림 상태 — 길게 누르기 메뉴가 닫힌 뒤에도 방 위에 유지된다. */
export type MessengerPhotoSelectSaveRequest = {
  messageId: string;
  /** 표시용 썸네일(앨범 순서). */
  thumbs: string[];
  /** 칸별 원본 URL(`messengerImageOriginalUrlSlots`, 저장 불가 칸은 ""). */
  slots: string[];
  /** 길게 누른 사진 — 미리 선택. */
  preselectIndex?: number;
};

type State = {
  request: MessengerPhotoSelectSaveRequest | null;
  open: (req: MessengerPhotoSelectSaveRequest) => void;
  close: () => void;
};

export const useMessengerPhotoSelectSaveStore = create<State>((set) => ({
  request: null,
  open: (req) => set({ request: req }),
  close: () => set({ request: null }),
}));

export function openMessengerPhotoSelectSave(req: MessengerPhotoSelectSaveRequest): void {
  useMessengerPhotoSelectSaveStore.getState().open(req);
}
