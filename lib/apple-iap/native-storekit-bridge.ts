/**
 * Capacitor bridge for DibayStoreKit (iOS StoreKit 2 · 네이티브 플러그인은 Build 23 에서 추가 예정).
 * 판단 기준은 쿠키·마커가 아니라 「앱에 플러그인이 실제로 등록돼 있는가」 — 구 바이너리·Android·웹은 false.
 */
import { registerPlugin } from "@capacitor/core";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { APPLE_IAP_STOREKIT_PLUGIN_ID } from "@/lib/apple-iap/apple-iap-contract";

export type StoreKitProduct = { productId: string; displayPrice: string };

export type StoreKitPurchaseResult =
  | { result: "success"; transactionId: string; signedTransaction: string }
  | { result: "userCancelled" }
  | { result: "pending" };

export type StoreKitUnfinishedTransaction = { transactionId: string; signedTransaction: string };

type DibayStoreKitPlugin = {
  getProducts(options: { productIds: string[] }): Promise<{ products: StoreKitProduct[] }>;
  purchase(options: { productId: string; appAccountToken: string }): Promise<StoreKitPurchaseResult>;
  finishTransaction(options: { transactionId: string }): Promise<void>;
  getUnfinishedTransactions(): Promise<{ transactions: StoreKitUnfinishedTransaction[] }>;
};

const Plugin = registerPlugin<DibayStoreKitPlugin>(APPLE_IAP_STOREKIT_PLUGIN_ID);

export function isAppleIapNativeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "ios") return false;
  const cap = (window as Window & { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }).Capacitor;
  return typeof cap?.isPluginAvailable === "function" && cap.isPluginAvailable(APPLE_IAP_STOREKIT_PLUGIN_ID) === true;
}

export async function storeKitGetProducts(productIds: string[]): Promise<StoreKitProduct[]> {
  if (!productIds.length) return [];
  const r = await Plugin.getProducts({ productIds });
  return Array.isArray(r?.products) ? r.products : [];
}

export function storeKitPurchase(productId: string, appAccountToken: string): Promise<StoreKitPurchaseResult> {
  return Plugin.purchase({ productId, appAccountToken });
}

export function storeKitFinishTransaction(transactionId: string): Promise<void> {
  return Plugin.finishTransaction({ transactionId });
}

export async function storeKitGetUnfinishedTransactions(): Promise<StoreKitUnfinishedTransaction[]> {
  const r = await Plugin.getUnfinishedTransactions();
  return Array.isArray(r?.transactions) ? r.transactions : [];
}
