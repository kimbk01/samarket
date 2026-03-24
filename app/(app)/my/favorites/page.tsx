"use client";

import { FavoriteProductsView } from "@/components/favorites/FavoriteProductsView";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function MyFavoritesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          관심상품
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="pt-0">
        <FavoriteProductsView />
      </div>
    </div>
  );
}
