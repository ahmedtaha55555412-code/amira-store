/**
 * Amira Store — checkout PURE helpers (PHASE-07), free of any I/O.
 *
 * Split from the transactional service (src/lib/storefront/checkout.ts) so
 * client components can share the EXACT same WhatsApp message/URL building
 * and phone normalization the server uses — one source of truth, zero
 * duplication, and no database/driver imports in the client bundle.
 *
 * Everything here is deterministic and side-effect free; the verify suite
 * exercises it directly in Node.
 */

/* -------------------------------------------------------------------------- */
/* Phone normalization (Egypt market — MASTER_PLAN §2/§32)                     */
/* -------------------------------------------------------------------------- */

/**
 * Normalize an Egyptian mobile number to the international `+20` form.
 * Accepted display forms: `01XXXXXXXXX`, `+201XXXXXXXXX`, `00201XXXXXXXXX`,
 * `201XXXXXXXXX` (with arbitrary spaces/dashes/punctuation). Egyptian mobile
 * prefixes are 10/11/12/15. Returns null for anything else.
 */
export function normalizeEgyptianPhone(raw: string): string | null {
  const digits = raw.replace(/\D+/g, '');
  let national: string;
  if (digits.startsWith('0020')) national = digits.slice(4);
  else if (digits.startsWith('20')) national = digits.slice(2);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;
  if (!/^1[0125]\d{8}$/.test(national)) return null;
  return `+20${national}`;
}

/* -------------------------------------------------------------------------- */
/* Money helpers (integer piasters — no float drift)                           */
/* -------------------------------------------------------------------------- */

/** numeric(12,2) string → integer piasters. */
export function moneyToCents(value: string): number {
  return Math.round(Number(value) * 100);
}

// Integer piasters → numeric(12,2)-shaped string: the canonical implementation
// is `centsToPriceString` in ./cart (single source of truth; ISSUE-046).

/** "504.00" → "504" / "504.50" → "504.5" — message text only (never logic). */
export function moneyForMessage(value: string): string {
  const trimmed = value.replace(/\.?0+$/, '');
  return trimmed.length > 0 ? trimmed : '0';
}

/* -------------------------------------------------------------------------- */
/* WhatsApp message + click-to-chat URL                                        */
/* -------------------------------------------------------------------------- */

export type WhatsAppOrderLine = {
  productName: string;
  /** e.g. "المقاس: L · اللون: أسود" (empty for no-attribute variants). */
  attributesLabel: string;
  quantity: number;
  unitPrice: string;
};

export type WhatsAppOrderSummary = {
  storeName: string;
  orderNumber: string;
  lines: WhatsAppOrderLine[];
  productsTotal: string;
  paymentMethod: string;
  customerName: string;
  address: string;
};

/** Fallback equal to the seeded default template (DATA is preferred). */
export const DEFAULT_WHATSAPP_TEMPLATE_FALLBACK = [
  'مرحبًا {store_name} 👋',
  'أرغب في تأكيد طلبي رقم {order_number}.',
  '',
  '{items}',
  '',
  'إجمالي المنتجات: {products_total} جنيه',
  'طريقة الدفع: {payment_method}',
  'الاسم: {customer_name}',
  'العنوان: {address}',
  'برجاء الاتفاق على تكلفة الشحن عبر واتساب.',
  'شكرًا لكم 🌸',
].join('\n');

/**
 * Fill the admin-editable template (store_settings.whatsapp_message_template —
 * seeded with the documented default). Unknown placeholders are left as-is so
 * a template typo is visible instead of silently vanishing.
 */
export function buildWhatsAppMessage(
  summary: WhatsAppOrderSummary,
  template: string,
): string {
  const itemsBlock = summary.lines
    .map((line) => {
      const attrs = line.attributesLabel ? ` (${line.attributesLabel})` : '';
      return `• ${line.productName}${attrs} ×${line.quantity} — ${moneyForMessage(line.unitPrice)} جنيه`;
    })
    .join('\n');

  const placeholders: Record<string, string> = {
    store_name: summary.storeName,
    order_number: summary.orderNumber,
    items: itemsBlock,
    products_total: moneyForMessage(summary.productsTotal),
    payment_method: summary.paymentMethod,
    customer_name: summary.customerName,
    address: summary.address,
  };

  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    key in placeholders ? placeholders[key]! : match,
  );
}

/** Properly URL-encoded click-to-chat URL (wa.me takes digits only). */
export function buildWhatsAppUrl(whatsappPhone: string, message: string): string {
  const digits = whatsappPhone.replace(/\D+/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
