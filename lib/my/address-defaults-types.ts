/** `/api/me/address-defaults` flags — mypage hub seed용 */
export type AddressDefaultsFlags = {
  master: boolean;
  life: boolean;
  trade: boolean;
  delivery: boolean;
} | null;
