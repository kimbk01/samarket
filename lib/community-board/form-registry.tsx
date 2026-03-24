"use client";

import type { FormTypeValue, BoardWriteFormComponent } from "./types";
import { CommunityForm } from "@/components/community-board/forms/CommunityForm";
import { GalleryForm } from "@/components/community-board/forms/GalleryForm";
import { QuestionForm } from "@/components/community-board/forms/QuestionForm";
import { PromoForm } from "@/components/community-board/forms/PromoForm";

const WRITE_FORMS: Record<FormTypeValue, BoardWriteFormComponent> = {
  basic: CommunityForm,
  gallery: GalleryForm,
  qna: QuestionForm,
  promo: PromoForm,
};

export function getWriteForm(formType: FormTypeValue): BoardWriteFormComponent {
  return WRITE_FORMS[formType] ?? WRITE_FORMS.basic;
}
