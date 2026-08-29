
const m = new Map();
const read = (k, f) => { try { return JSON.parse(m.get(k)) ?? f; } catch { return f; } };
const write = (k, v) => { m.set(k, JSON.stringify(v)); };
export const getFavs = () => read('f', []);
export const isFav = (id) => getFavs().some((t) => t.id === id);
export const toggleFav = (t) => { const f = getFavs(); const i = f.findIndex((x) => x.id === t.id); if (i >= 0) { f.splice(i, 1); write('f', f); return false; } f.unshift(t); write('f', f); return true; };
export const pushRecent = (t) => { let r = read('r', []).filter((x) => x.id !== t.id); r.unshift(t); write('r', r.slice(0, 100)); };
export const getSettings = () => read('s', {});
export const setSetting = (k, v) => write('s', { ...read('s', {}), [k]: v });
