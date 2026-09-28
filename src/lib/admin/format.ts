/**
 * Amira Store — admin display formatting (PHASE-08).
 * Arabic Gregorian dates with Latin digits (matches the dashboard's format).
 */

const dateTimeFormat = new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  calendar: 'gregory',
  numberingSystem: 'latn',
});

export function formatAdminDateTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormat.format(date);
}
