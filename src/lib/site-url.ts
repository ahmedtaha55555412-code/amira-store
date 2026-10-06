export function siteOrigin(): string {
  const configured =
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : '');

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('APP_URL or VERCEL_URL must be configured in production.');
    }
    return 'http://localhost:3000';
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('APP_URL must be an absolute HTTP(S) URL.');
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
  ) {
    throw new Error('APP_URL must use HTTPS in production.');
  }

  return url.origin;
}
