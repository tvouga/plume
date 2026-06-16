// Avatar source helpers. We resolve, in order of preference:
//   1. Microsoft directory photo (real colleague photos)  — handled in the hook
//   2. Gravatar (real photo if the person has one)
//   3. A generated illustrated face (always works)
// Generated/Gravatar lookups use a HASH of the email, so no plaintext address
// is ever sent to a third-party avatar service.

export function isEmail(value?: string | null): value is string {
  return !!value && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

/** Lowercase + SHA-256 hex of an email (Gravatar's modern hashing). */
export async function emailHash(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.trim().toLowerCase())
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Gravatar URL that 404s when the person has no Gravatar (so we can fall back). */
export function gravatarUrl(hash: string, size = 128): string {
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=404`
}

/** A deterministic, friendly illustrated avatar from DiceBear. */
export function generatedUrl(seed: string, size = 128): string {
  // Diverse, accessible palette: spread across hues, good saturation & contrast
  const palette =
    'ff6b6b,4ecdc4,45b7d1,f9ca24,6c5ce7,a29bfe,' + // reds, cyans, blues, yellows, purples
    'fd79a8,fdcb6e,6c5ce7,00b894,74b9ff,dfe6e9,' + // pinks, warm tones, greens, grays
    'e17055,d63031,ff7675,fab1a0,74b9ff,0984e3,' + // oranges, reds, cool blues
    '6c5ce7,a29bfe,5f27cd,341f97,ee5a6f,f368e0'   // purples, deep tones, magentas
  return (
    `https://api.dicebear.com/9.x/bottts-neutral/svg` +
    `?seed=${encodeURIComponent(seed)}&size=${size}&backgroundColor=${palette}`
  )
}
