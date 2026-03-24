import { ConditionalAppShell } from "@/components/layout/ConditionalAppShell";
import { AppStickyHeader } from "@/components/layout/AppStickyHeader";
import { AppTitle } from "@/components/layout/AppTitle";
import { CategoryListHeaderProvider } from "@/contexts/CategoryListHeaderContext";
import { FavoriteProvider } from "@/contexts/FavoriteContext";
import { RegionProvider } from "@/contexts/RegionContext";
import { StoreCommerceCartProvider } from "@/contexts/StoreCommerceCartContext";
import { WriteCategoryProvider } from "@/contexts/WriteCategoryContext";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RegionProvider>
      <FavoriteProvider>
        <WriteCategoryProvider>
          <CategoryListHeaderProvider>
            <StoreCommerceCartProvider>
              <AppTitle />
              <AppStickyHeader />
              <ConditionalAppShell regionBarInLayout>{children}</ConditionalAppShell>
            </StoreCommerceCartProvider>
          </CategoryListHeaderProvider>
        </WriteCategoryProvider>
      </FavoriteProvider>
    </RegionProvider>
  );
}
