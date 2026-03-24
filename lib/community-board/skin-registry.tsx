"use client";

import type { SkinType, BoardListSkinComponent, BoardDetailSkinComponent } from "./types";
import { BasicListSkin } from "@/components/community-board/skins/list/BasicListSkin";
import { GalleryListSkin } from "@/components/community-board/skins/list/GalleryListSkin";
import { MagazineListSkin } from "@/components/community-board/skins/list/MagazineListSkin";
import { QnaListSkin } from "@/components/community-board/skins/list/QnaListSkin";
import { PromoListSkin } from "@/components/community-board/skins/list/PromoListSkin";
import { BasicDetailSkin } from "@/components/community-board/skins/detail/BasicDetailSkin";
import { GalleryDetailSkin } from "@/components/community-board/skins/detail/GalleryDetailSkin";
import { MagazineDetailSkin } from "@/components/community-board/skins/detail/MagazineDetailSkin";
import { QnaDetailSkin } from "@/components/community-board/skins/detail/QnaDetailSkin";
import { PromoDetailSkin } from "@/components/community-board/skins/detail/PromoDetailSkin";

const LIST_SKINS: Record<SkinType, BoardListSkinComponent> = {
  basic: BasicListSkin,
  gallery: GalleryListSkin,
  magazine: MagazineListSkin,
  qna: QnaListSkin,
  promo: PromoListSkin,
};

const DETAIL_SKINS: Record<SkinType, BoardDetailSkinComponent> = {
  basic: BasicDetailSkin,
  gallery: GalleryDetailSkin,
  magazine: MagazineDetailSkin,
  qna: QnaDetailSkin,
  promo: PromoDetailSkin,
};

export function getListSkin(skinType: SkinType): BoardListSkinComponent {
  return LIST_SKINS[skinType] ?? LIST_SKINS.basic;
}

export function getDetailSkin(skinType: SkinType): BoardDetailSkinComponent {
  return DETAIL_SKINS[skinType] ?? DETAIL_SKINS.basic;
}
