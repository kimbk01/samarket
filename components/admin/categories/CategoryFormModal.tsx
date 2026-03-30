"use client";

import { useCallback, useEffect, useState } from "react";
import type { CategoryWithSettings, CategoryType, QuickCreateGroup } from "@/lib/categories/types";
import {
  CATEGORY_TYPE_LABELS,
  POST_TYPE_OPTIONS,
  CATEGORY_TYPE_DEFAULT_SETTINGS,
  MENU_TYPE_OPTIONS,
  TRADE_SUBTYPE_OPTIONS,
  TRADE_SUBTYPE_PRESET_VALUES,
  COMMUNITY_SKIN_OPTIONS,
} from "@/lib/types/category";
import { validateSlugFormat } from "@/lib/categories/validateSlug";
import { checkSlugAvailable } from "@/lib/categories/admin/checkSlugAvailable";
import { CategoryMenuIconPicker } from "@/components/admin/categories/CategoryMenuIconPicker";

function slugifyForIconKey(s: string): string {
  const v = s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return v || "custom";
}

export interface CategoryFormPayload {
  name: string;
  slug: string;
  icon_key: string;
  type: CategoryType;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  quick_create_enabled: boolean;
  quick_create_group: QuickCreateGroup | null;
  quick_create_order: number;
  show_in_home_chips: boolean;
}

export interface CategoryFormSettingsPayload {
  can_write: boolean;
  has_price: boolean;
  has_chat: boolean;
  has_location: boolean;
  has_direct_deal: boolean;
  has_free_share: boolean;
  post_type: string;
}

/** "menu" = 메뉴 관리용. forceType = 중고/동네생활 메뉴 페이지에서 해당 타입만 고정 */
interface CategoryFormModalProps {
  category?: CategoryWithSettings | null;
  nextSortOrder?: number;
  mode?: "menu";
  /** 중고거래 폼 페이지: "trade", 게시판 폼 페이지: "community" → 타입 선택 숨기고 해당 타입만 사용 */
  forceType?: "trade" | "community";
  onSave: (payload: CategoryFormPayload, settings: CategoryFormSettingsPayload) => void | Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}

export function CategoryFormModal({
  category,
  nextSortOrder = 0,
  mode,
  forceType,
  onSave,
  onDelete,
  onClose,
}: CategoryFormModalProps) {
  const isMenuMode = mode === "menu";
  const fixedType = forceType;
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [icon_key, setIconKey] = useState(category?.icon_key ?? "default");
  const [type, setType] = useState<CategoryType>(category?.type ?? (fixedType as CategoryType) ?? "trade");
  const [tradeSubtype, setTradeSubtype] = useState(
    category?.type === "trade" && TRADE_SUBTYPE_PRESET_VALUES.includes(category?.icon_key ?? "")
      ? category.icon_key
      : category?.type === "trade" && category?.icon_key
        ? "__custom__"
        : "general"
  );
  const [customTradeSubtype, setCustomTradeSubtype] = useState(
    category?.type === "trade" && category?.icon_key && !TRADE_SUBTYPE_PRESET_VALUES.includes(category.icon_key)
      ? category.icon_key
      : ""
  );
  const [communitySkin, setCommunitySkin] = useState(
    category?.type === "community" && COMMUNITY_SKIN_OPTIONS.some((o) => o.value === category?.icon_key)
      ? category.icon_key
      : "basic"
  );
  const [sort_order, setSortOrder] = useState(category?.sort_order ?? nextSortOrder);
  const [is_active, setIsActive] = useState(category?.is_active ?? true);
  const [description, setDescription] = useState(category?.description ?? "");
  const [can_write, setCanWrite] = useState(category?.settings?.can_write ?? true);
  const [has_price, setHasPrice] = useState(category?.settings?.has_price ?? false);
  const [has_chat, setHasChat] = useState(category?.settings?.has_chat ?? false);
  const [has_location, setHasLocation] = useState(category?.settings?.has_location ?? false);
  const [has_direct_deal, setHasDirectDeal] = useState(category?.settings?.has_direct_deal ?? true);
  const [has_free_share, setHasFreeShare] = useState(category?.settings?.has_free_share ?? true);
  const [post_type, setPostType] = useState(category?.settings?.post_type ?? "normal");
  const [quick_create_enabled, setQuickCreateEnabled] = useState(category?.quick_create_enabled ?? false);
  const [quick_create_group, setQuickCreateGroup] = useState<QuickCreateGroup | null>(category?.quick_create_group ?? null);
  const [quick_create_order, setQuickCreateOrder] = useState(category?.quick_create_order ?? 0);
  const [show_in_home_chips, setShowInHomeChips] = useState(category?.show_in_home_chips ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setSlug(category.slug);
      setIconKey(category.icon_key);
      setType(category.type);
      setSortOrder(category.sort_order);
      setIsActive(category.is_active);
      setDescription(category.description ?? "");
      setCanWrite(category.settings?.can_write ?? true);
      setHasPrice(category.settings?.has_price ?? false);
      setHasChat(category.settings?.has_chat ?? false);
      setHasLocation(category.settings?.has_location ?? false);
      setHasDirectDeal(category.settings?.has_direct_deal ?? true);
      setHasFreeShare(category.settings?.has_free_share ?? true);
      setPostType(category.settings?.post_type ?? "normal");
      setQuickCreateEnabled(category.quick_create_enabled ?? false);
      setQuickCreateGroup(category.quick_create_group ?? null);
      setQuickCreateOrder(category.quick_create_order ?? 0);
      setShowInHomeChips(category.show_in_home_chips ?? true);
      if (isMenuMode) {
        if (category.type === "service" || category.type === "feature") {
          setType("trade");
        }
        if (category.type === "trade" && TRADE_SUBTYPE_PRESET_VALUES.includes(category.icon_key ?? "")) {
          setTradeSubtype(category.icon_key);
        } else if (category.type === "trade" && category.icon_key) {
          setTradeSubtype("__custom__");
          setCustomTradeSubtype(category.icon_key);
        } else if (category.type === "trade") {
          setTradeSubtype("general");
        }
        if (category.type === "community" && COMMUNITY_SKIN_OPTIONS.some((o) => o.value === category.icon_key)) {
          setCommunitySkin(category.icon_key);
        } else if (category.type === "community") {
          setCommunitySkin("basic");
        }
      }
    } else {
      setSortOrder(nextSortOrder);
      if (fixedType) setType(fixedType);
      const t = fixedType ?? type;
      const def = CATEGORY_TYPE_DEFAULT_SETTINGS[t as CategoryType];
      setCanWrite(def.can_write);
      setHasPrice(def.has_price);
      setHasChat(def.has_chat);
      setHasLocation(def.has_location);
      setPostType(def.post_type);
    }
  }, [category, nextSortOrder, isMenuMode, fixedType]);

  const handleTypeChange = useCallback(
    (newType: CategoryType) => {
      setType(newType);
      const def = CATEGORY_TYPE_DEFAULT_SETTINGS[newType];
      setCanWrite(def.can_write);
      setHasPrice(def.has_price);
      setHasChat(def.has_chat);
      setHasLocation(def.has_location);
      setPostType(def.post_type);
      if (isMenuMode) {
        if (newType === "trade") setIconKey(tradeSubtype);
        else if (newType === "community") setIconKey(communitySkin);
      }
    },
    [isMenuMode, tradeSubtype, communitySkin]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSlugError(null);
      const slugTrim = slug.trim();
      if (!name.trim() || !slugTrim) return;

      const formatCheck = validateSlugFormat(slugTrim);
      if (!formatCheck.ok) {
        setSlugError(formatCheck.error);
        return;
      }
      const slugCheck = await checkSlugAvailable(slugTrim, category?.id);
      if (!slugCheck.available) {
        setSlugError(slugCheck.error);
        return;
      }

      if (isMenuMode && (type === "trade" || fixedType === "trade") && tradeSubtype === "__custom__" && !customTradeSubtype.trim()) {
        setSlugError("추가(직접 입력) 선택 시 종류 값을 입력해 주세요.");
        return;
      }

      setSubmitting(true);
      try {
        const resolvedType = (fixedType ?? type) as CategoryType;
        const resolvedIconKey = isMenuMode
          ? resolvedType === "trade"
            ? tradeSubtype === "__custom__"
              ? slugifyForIconKey(customTradeSubtype.trim() || "custom")
              : tradeSubtype
            : resolvedType === "community"
              ? communitySkin
              : icon_key
          : icon_key;
        await onSave(
          {
            name: name.trim(),
            slug: slugTrim,
            icon_key: resolvedIconKey,
            type: resolvedType,
            sort_order,
            is_active,
            description: description.trim() || null,
            quick_create_enabled,
            quick_create_group,
            quick_create_order,
            show_in_home_chips,
          },
          { can_write, has_price, has_chat, has_location, has_direct_deal, has_free_share, post_type }
        );
        onClose();
      } finally {
        setSubmitting(false);
      }
    },
    [
      name,
      slug,
      icon_key,
      type,
      sort_order,
      is_active,
      description,
      quick_create_enabled,
      quick_create_group,
      quick_create_order,
      show_in_home_chips,
      can_write,
      has_price,
      has_chat,
      has_location,
      has_direct_deal,
      has_free_share,
      post_type,
      category?.id,
      onSave,
      onClose,
      isMenuMode,
      fixedType,
      type,
      tradeSubtype,
      customTradeSubtype,
      communitySkin,
    ]
  );

  const isCreate = !category;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-[17px] font-semibold text-gray-900">
          {isCreate ? (isMenuMode ? "항목 추가" : "카테고리 추가") : isMenuMode ? "항목 수정" : "카테고리 수정"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-gray-700">카테고리명 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
              required
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700">slug * (영문 소문자, 숫자, 하이픈만)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setSlugError(null);
              }}
              placeholder="jobs, real-estate, bulk-sell"
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
              required
            />
            {slugError && <p className="mt-1 text-[12px] text-red-600">{slugError}</p>}
          </div>
          {!isMenuMode && (
            <div>
              <label className="block text-[13px] font-medium text-gray-700">아이콘</label>
              <input
                type="text"
                value={icon_key}
                onChange={(e) => setIconKey(e.target.value)}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
              />
            </div>
          )}
          {(!isMenuMode || !fixedType) && (
            <div>
              <label className="block text-[13px] font-medium text-gray-700">타입</label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as CategoryType)}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
              >
                {isMenuMode
                  ? MENU_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))
                  : (Object.keys(CATEGORY_TYPE_LABELS) as CategoryType[]).map((t) => (
                      <option key={t} value={t}>
                        {CATEGORY_TYPE_LABELS[t]}
                      </option>
                    ))}
              </select>
            </div>
          )}
          {isMenuMode && (type === "trade" || fixedType === "trade") && (
            <div>
              <label className="block text-[13px] font-medium text-gray-700">종류</label>
              <select
                value={tradeSubtype}
                onChange={(e) => {
                  const v = e.target.value;
                  setTradeSubtype(v);
                  if (v !== "__custom__") setIconKey(v);
                  else if (customTradeSubtype.trim()) setIconKey(slugifyForIconKey(customTradeSubtype));
                }}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
              >
                {TRADE_SUBTYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {tradeSubtype === "__custom__" && (
                <input
                  type="text"
                  value={customTradeSubtype}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomTradeSubtype(v);
                    setIconKey(v.trim() ? slugifyForIconKey(v) : "__custom__");
                  }}
                  placeholder="예: 중고배송, direct-deal (영문 소문자·숫자·하이픈)"
                  className="mt-2 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
                />
              )}
              <p className="mt-1 text-[11px] text-gray-500">일반·중고차·부동산·알바·환전 외 추가 가능. 직거래·나눔은 기능 설정에서 쓰기 선택 항목으로 둡니다.</p>
              {tradeSubtype !== "__custom__" ? (
                <div className="mt-3">
                  <CategoryMenuIconPicker
                    variant="trade"
                    value={tradeSubtype}
                    onChange={(v) => {
                      setTradeSubtype(v);
                      setIconKey(v);
                    }}
                  />
                </div>
              ) : null}
            </div>
          )}
          {isMenuMode && (type === "community" || fixedType === "community") && (
            <div>
              <label className="block text-[13px] font-medium text-gray-700">게시판 스킨</label>
              <select
                value={communitySkin}
                onChange={(e) => {
                  const v = e.target.value;
                  setCommunitySkin(v);
                  setIconKey(v);
                }}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
              >
                {COMMUNITY_SKIN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="mt-3">
                <CategoryMenuIconPicker
                  variant="community"
                  value={communitySkin}
                  onChange={(v) => {
                    setCommunitySkin(v);
                    setIconKey(v);
                  }}
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-gray-700">순서 (sort_order)</label>
              <input
                type="number"
                min={0}
                value={sort_order}
                onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                <span className="text-[13px] text-gray-700">사용 (is_active)</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700">설명</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
            />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="mb-2 text-[13px] font-medium text-gray-700">
              {isMenuMode ? "웹 + 퀵메뉴" : "Quick Create (글쓰기 런처)"}
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={show_in_home_chips}
                  onChange={(e) => setShowInHomeChips(e.target.checked)}
                  className="rounded"
                />
                <span className="text-[13px] text-gray-700">
                  {isMenuMode ? "웹 메뉴 노출" : "상단 카테고리 칩 노출"}
                </span>
              </label>
              {isMenuMode && (
                <p className="text-[11px] text-gray-500">켜면 홈 상단 가로 메뉴(칩)에 이 항목이 표시됩니다.</p>
              )}
              {!isMenuMode && (
                <p className="text-[11px] text-gray-500">
                  해제하면 홈 상단 칩에는 안 보이고, Quick Create(런처)에만 노출할 수 있어요.
                </p>
              )}
              <div className="border-t border-gray-100 pt-3 mt-2">
                <span className="block text-[12px] font-medium text-gray-600 mb-1">홈 글쓰기 플로팅 메뉴 (주제 선택)</span>
                <p className="mb-2 text-[11px] leading-relaxed text-gray-500">
                  켜면 홈·거래 화면에서 + 메뉴의 「글쓰기」 목록에 이 항목이 나옵니다. 거래/커뮤니티 타입별로 섹션이 나뉘며, 같은 타입 안에서는 아래 숫자가 작을수록 위에 표시됩니다.
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={quick_create_enabled}
                    onChange={(e) => setQuickCreateEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-[13px] text-gray-700">런처에 표시</span>
                </label>
                <div className="mt-2">
                  <label className="block text-[12px] text-gray-600">런처 그룹 (선택)</label>
                  <select
                    value={quick_create_group ?? ""}
                    onChange={(e) => setQuickCreateGroup((e.target.value || null) as QuickCreateGroup | null)}
                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
                  >
                    <option value="">지정 안 함</option>
                    <option value="content">콘텐츠·커뮤니티류 (content)</option>
                    <option value="trade">거래·판매류 (trade)</option>
                  </select>
                  <p className="mt-0.5 text-[10px] text-gray-400">DB·레거시 분류용입니다. 앱 목록은 주로 「타입」으로 묶입니다.</p>
                </div>
                <div className="mt-2">
                  <label className="block text-[12px] text-gray-600">런처 순서 (같은 타입 내)</label>
                  <input
                    type="number"
                    min={0}
                    value={quick_create_order}
                    onChange={(e) => setQuickCreateOrder(parseInt(e.target.value, 10) || 0)}
                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="mb-2 text-[13px] font-medium text-gray-700">기능 설정</p>
            <div className="space-y-2">
              <LabelCheck checked={can_write} onChange={setCanWrite} label="글쓰기 (can_write)" />
              <LabelCheck checked={has_price} onChange={setHasPrice} label="가격 (has_price)" />
              <LabelCheck checked={has_chat} onChange={setHasChat} label="채팅 (has_chat)" />
              <LabelCheck checked={has_location} onChange={setHasLocation} label="위치 (has_location)" />
              <LabelCheck checked={has_direct_deal} onChange={setHasDirectDeal} label="직거래 선택 (has_direct_deal)" />
              <LabelCheck checked={has_free_share} onChange={setHasFreeShare} label="나눔 선택 (has_free_share)" />
              <div>
                <label className="block text-[12px] text-gray-600">post_type</label>
                <select
                  value={post_type}
                  onChange={(e) => setPostType(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
                >
                  {POST_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-signature px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
            >
              {submitting ? "저장 중…" : "저장"}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-[14px] text-gray-700">
              취소
            </button>
            {!isCreate && onDelete && (
              <button type="button" onClick={onDelete} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[14px] text-red-700">
                삭제
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function LabelCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      <span className="text-[13px] text-gray-700">{label}</span>
    </label>
  );
}
