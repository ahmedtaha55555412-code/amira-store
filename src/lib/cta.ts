export function isSafeCtaHref(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes('\\') || trimmed.startsWith('//')) return false;

  if (trimmed.startsWith('/')) return true;

  return /^https:\/\/wa\.me\/\d{8,15}(?:\?.*)?$/i.test(trimmed);
}

export function isExternalCtaHref(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  return /^https:\/\/wa\.me\/\d{8,15}(?:\?.*)?$/i.test(value.trim());
}

export function sanitizeCtaHref(value: string | null | undefined, fallback = '#'): string {
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  if (!isSafeCtaHref(trimmed)) return fallback;

  return trimmed;
}
