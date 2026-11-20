import * as crypto from 'crypto';

/**
 * Calculates a canonical, deterministic SHA-256 content hash of the applications array.
 * Keys are recursively sorted to guarantee that JSON formatting differences or object key
 * order variations do not produce different cryptographic digests across PostgreSQL jsonb,
 * network hops, or runtime platforms.
 */
export function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalStringify(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs: string[] = [];
  for (const key of sortedKeys) {
    const value = (obj as Record<string, unknown>)[key];
    if (value === undefined) continue;
    pairs.push(JSON.stringify(key) + ':' + canonicalStringify(value));
  }

  return '{' + pairs.join(',') + '}';
}

export function computeContentHash(applications: unknown[]): string {
  const canonicalJson = canonicalStringify(applications);
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
