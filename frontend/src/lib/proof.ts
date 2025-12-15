/**
 * Recursively sorts object keys to ensure deterministic serialization.
 * Arrays preserve order.
 */
export const canonicalizeJson = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJson);
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalizeJson(obj[key]);
        return acc;
      }, {} as any);
  }
  return obj;
};

/**
 * Computes SHA-256 hash of a JSON object (canonicalized).
 * Returns hex string.
 */
export const computeManifestHash = async (data: any): Promise<string> => {
  const canonical = canonicalizeJson(data);
  const jsonString = JSON.stringify(canonical);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(jsonString);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

/**
 * Validates if a recomputed hash matches the on-chain hash.
 */
export const verifyHashMatch = async (data: any, expectedHash: string): Promise<boolean> => {
  const computed = await computeManifestHash(data);
  return computed.toLowerCase() === expectedHash.toLowerCase();
};
