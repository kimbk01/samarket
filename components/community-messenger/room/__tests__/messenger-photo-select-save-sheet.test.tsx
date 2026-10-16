// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveMock = vi.fn(async () => null);
vi.mock("@/components/community-messenger/room/messenger-photo-save-feedback", () => ({
  saveMessengerPhotosWithFeedback: (...args: unknown[]) => saveMock(...(args as [])),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k) }),
}));

import { MessengerPhotoSelectSaveSheet } from "@/components/community-messenger/room/MessengerPhotoSelectSaveSheet";
import {
  openMessengerPhotoSelectSave,
  useMessengerPhotoSelectSaveStore,
} from "@/lib/community-messenger/stores/messenger-photo-select-save-store";

const P = "https://x.supabase.co/storage/v1/object/public/post-images/u/r";
const slots = [0, 1, 2, 3, 4].map((i) => `${P}/${i}.jpg`);
const thumbs = [0, 1, 2, 3, 4].map((i) => `${P}/${i}.thumb.webp`);

function checkboxes(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('[role="checkbox"]'));
}
function buttonByText(prefix: string): HTMLButtonElement {
  return Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.startsWith(prefix))!;
}

describe("MessengerPhotoSelectSaveSheet", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    saveMock.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<MessengerPhotoSelectSaveSheet />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("pre-selects the pressed photo and saves selected originals in album order, then closes", () => {
    act(() => openMessengerPhotoSelectSave({ messageId: "m1", slots, thumbs, preselectIndex: 3 }));
    const boxes = checkboxes();
    expect(boxes.length).toBe(5);
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual(["false", "false", "false", "true", "false"]);
    expect(boxes[0]!.querySelector("img")!.getAttribute("src")).toBe(thumbs[0]);
    act(() => boxes[1]!.click());
    act(() => buttonByText("cm_ui_photo_save_selected").click());
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect((saveMock.mock.calls[0] as unknown[])[0]).toEqual([slots[1], slots[3]]);
    expect(useMessengerPhotoSelectSaveStore.getState().request).toBeNull();
  });

  it("select all / deselect all; save disabled with nothing selected", () => {
    act(() => openMessengerPhotoSelectSave({ messageId: "m2", slots: [...slots.slice(0, 2), "", slots[3]!], thumbs }));
    const save = () => buttonByText("cm_ui_photo_save_selected");
    expect(save().disabled).toBe(true);
    act(() => buttonByText("cm_ui_photo_select_all").click());
    expect(save().textContent).toContain('"count":3');
    act(() => buttonByText("cm_ui_photo_deselect_all").click());
    expect(save().disabled).toBe(true);
    act(() => buttonByText("cm_ui_photo_select_all").click());
    act(() => save().click());
    expect((saveMock.mock.calls[0] as unknown[])[0]).toEqual([slots[0], slots[1], slots[3]]);
  });
});
