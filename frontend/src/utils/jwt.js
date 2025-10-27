// Lightweight JWT decoder (browser). Decodes JWT payload (base64url) and returns parsed JSON or null.
export function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    // base64url -> base64
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if missing
    const pad = payload.length % 4;
    const padded = pad ? payload + '='.repeat(4 - pad) : payload;
    const decoded = atob(padded);
    try {
      return JSON.parse(decoded);
    } catch {
      // Sometimes the decoded string contains percent-encoded bytes
      const uriDecoded = decodeURIComponent(
        decoded
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      return JSON.parse(uriDecoded);
    }
  } catch {
    return null;
  }
}
