// Process-local only: do not persist lecture text or generated material to a shared cache.
// Each caller receives a clone so editing one draft cannot alter another professor's draft.
export function createGenerationCache<T>(maxEntries = 8, ttlMs = 30 * 60_000, now = Date.now) {
  const entries = new Map<string, { expires: number; value: Promise<T> }>();
  return async (key: string, generate: () => Promise<T>): Promise<T> => {
    const time = now();
    for (const [id, entry] of entries) if (entry.expires <= time) entries.delete(id);
    let entry = entries.get(key);
    if (entry) {
      entries.delete(key);
      entries.set(key, entry);
    } else {
      const value = Promise.resolve().then(generate);
      entry = { expires: time + ttlMs, value };
      entries.set(key, entry);
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
      const current = entry;
      void value.catch(() => { if (entries.get(key) === current) entries.delete(key); });
    }
    return structuredClone(await entry.value);
  };
}
