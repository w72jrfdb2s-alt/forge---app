// Petite couche qui imite l'API window.storage des artifacts Claude,
// mais utilise localStorage puisque l'app tourne en dehors de Claude.ai.

type StorageResult = { key: string; value: string } | null;

export const storage = {
  async get(key: string): Promise<StorageResult> {
    const value = localStorage.getItem(key);
    if (value === null) return null;
    return { key, value };
  },
  async set(key: string, value: string): Promise<StorageResult> {
    localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key: string): Promise<{ key: string; deleted: boolean } | null> {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
};
