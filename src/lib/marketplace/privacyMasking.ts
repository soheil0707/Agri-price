/**
 * Utility functions for demo-safe presentation masking of personal identifiable information (PII)
 * and precise database status labeling.
 */

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const atIdx = email.indexOf('@');
  if (atIdx <= 0) return '•••@•••.com';
  const localPart = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  const visible = localPart.length > 2 ? localPart.slice(0, 2) : localPart.slice(0, 1);
  const domainParts = domain.split('.');
  const maskedDomain = domainParts.length > 1
    ? `${domainParts[0].slice(0, 1)}***.${domainParts.slice(1).join('.')}`
    : '***.com';
  return `${visible}***@${maskedDomain}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '+91 ••••• •••••';
  const last2 = digits.slice(-2);
  return `+91 ••••• ••${last2}`;
}

export function formatDatabaseStatus(
  isRealDatabaseConnected: boolean,
  listingCount: number,
  error: string | null = null
): string {
  if (error) {
    return `Database query failed · Demo data shown (${error})`;
  }
  if (!isRealDatabaseConnected) {
    return 'Database not connected · Demo data shown';
  }
  if (listingCount > 0) {
    return `Supabase connected · ${listingCount} live listing${listingCount > 1 ? 's' : ''}`;
  }
  return 'Supabase connected · 0 live listings · Demo data shown';
}
