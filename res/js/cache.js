window.SessionCache = {
  CACHE_TTL: 5 * 60 * 1000,

  get(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp > this.CACHE_TTL) {
        sessionStorage.removeItem(key);
        return null;
      }
      return cached;
    } catch { return null; }
  },

  set(key, data) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ...data, timestamp: Date.now() }));
    } catch { /* storage full */ }
  }
};
