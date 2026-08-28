/**
 * QA harness — archive Gift products after runtime proof so they do not
 * pollute customer catalog (active + archived_at lifecycle authority).
 */

export async function archiveGiftQaProducts(sb, productIds) {
  const ids = [...new Set((productIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  const archived = [];
  for (const id of ids) {
    const at = new Date().toISOString();
    const { error } = await sb
      .from("gift_certificate_products")
      .update({ active: false, archived_at: at })
      .eq("id", id);
    if (!error) archived.push(id);
  }
  return { archived, skipped: ids.filter((id) => !archived.includes(id)) };
}
