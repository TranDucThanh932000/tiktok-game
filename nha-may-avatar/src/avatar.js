const CDN_HOSTS = /(^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|byteimg\.com|ibyteimg\.com|ibytedtos\.com|tiktokv\.com|muscdn\.com)$/i;
const MAX_BYTES = 2_000_000;

export class AvatarError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function avatarUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new AvatarError('Invalid photo URL.', 400); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !CDN_HOSTS.test(url.hostname)) {
    throw new AvatarError('TikTok HTTPS images only.', 403);
  }
  return url;
}

export function createAvatarLoader({ fetchImage = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();

  async function download(initial) {
    let url = initial;
    const signal = AbortSignal.timeout(8000);
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      const response = await fetchImage(url.href, { redirect: 'manual', signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new AvatarError('Image redirect has no URL.');
        url = avatarUrl(new URL(location, url).href);
        continue;
      }
      const type = (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase().trim();
      if (!response.ok || !/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) {
        await response.body?.cancel();
        throw new AvatarError('Image format not supported.');
      }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        await response.body?.cancel();
        throw new AvatarError('Image too large. Max 2 MB.', 413);
      }
      if (!response.body) throw new AvatarError('No image data.');
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) throw new AvatarError('Image too large. Max 2 MB.', 413);
        chunks.push(chunk);
      }
      if (!bytes) throw new AvatarError('Empty image.');
      return { type, buffer: Buffer.concat(chunks), expires: now() + 10 * 60_000 };
    }
    throw new AvatarError('Too many image redirects.');
  }

  return async value => {
    const url = avatarUrl(value);
    const hit = cache.get(url.href);
    if (hit && hit.expires > now()) return hit;
    if (pending.has(url.href)) return pending.get(url.href);
    if (pending.size >= 8) throw new AvatarError('Image loader busy. Try again.', 503);
    const request = download(url).then(image => {
      cache.delete(url.href);
      cache.set(url.href, image);
      if (cache.size > 32) cache.delete(cache.keys().next().value);
      return image;
    }).catch(error => {
      if (error instanceof AvatarError) throw error;
      throw new AvatarError('Image download failed. Check your connection.');
    }).finally(() => pending.delete(url.href));
    pending.set(url.href, request);
    return request;
  };
}
