/* Render independently of sync storage. Keep durable local drafts and coalesce
   cloud writes; acknowledgements never overwrite a more recent local draft. */
(() => {
  'use strict';
  const draftPrefix = 'bali-draft:', ackPrefix = 'bali-ack:';
  const pending = new Map(), drafts = new Map(), acks = new Map(), listeners = new Set();
  let timer = 0, busy = false, retry = 2000, serial = 0;
  const notify = changes => { if (Object.keys(changes).length) for (const fn of listeners) fn(changes); };
  function schedule(delay = 650) {
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }
  async function flush() {
    timer = 0;
    if (busy || !pending.size) return;
    busy = true;
    const batch = new Map(pending);
    try {
      await chrome.storage.sync.set(Object.fromEntries([...batch].map(([key, record]) => [key, record.value])));
      const ack = {};
      for (const [key, record] of batch) {
        if (pending.get(key)?.stamp === record.stamp) pending.delete(key);
        acks.set(key, Math.max(acks.get(key) || 0, record.stamp));
        ack[ackPrefix + key] = record.stamp;
      }
      await chrome.storage.local.set(ack);
      retry = 2000;
    } catch (_) {
      // Local drafts remain durable while sync is unavailable or rate-limited.
      retry = Math.min(60000, retry * 2);
    } finally {
      busy = false;
      if (pending.size) schedule(retry);
    }
  }
  async function get() {
    const [cloud, local] = await Promise.allSettled([chrome.storage.sync.get(null), chrome.storage.local.get(null)]);
    const values = cloud.status === 'fulfilled' ? { ...cloud.value } : {};
    const cache = local.status === 'fulfilled' ? local.value : {};
    for (const [name, record] of Object.entries(cache)) {
      if (!name.startsWith(draftPrefix) || !record || !Number.isFinite(record.stamp)) continue;
      const key = name.slice(draftPrefix.length), ack = Number(cache[ackPrefix + key]) || 0;
      drafts.set(key, record); acks.set(key, ack);
      if (record.stamp > ack) { pending.set(key, record); values[key] = record.value; }
      else if (cloud.status !== 'fulfilled') values[key] = record.value;
    }
    if (pending.size) schedule();
    return values;
  }
  async function set(patch) {
    const payload = {};
    for (const [key, value] of Object.entries(patch)) {
      const record = { value, stamp: Math.max(Date.now() * 1000 + (serial++ % 1000), (drafts.get(key)?.stamp || 0) + 1) };
      drafts.set(key, record); pending.set(key, record); payload[draftPrefix + key] = record;
    }
    try { await chrome.storage.local.set(payload); } catch (_) { /* still attempt cloud sync */ }
    schedule();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    const actual = {};
    for (const [name, change] of Object.entries(changes)) {
      if (area === 'local' && name.startsWith(draftPrefix) && change.newValue) {
        const key = name.slice(draftPrefix.length), record = change.newValue;
        if (record.stamp < (drafts.get(key)?.stamp || 0)) continue;
        drafts.set(key, record);
        if (pending.has(key) && record.stamp > pending.get(key).stamp) pending.set(key, record);
        actual[key] = { oldValue: change.oldValue?.value, newValue: record.value };
      } else if (area === 'local' && name.startsWith(ackPrefix)) {
        const key = name.slice(ackPrefix.length);
        acks.set(key, Math.max(acks.get(key) || 0, Number(change.newValue) || 0));
        if ((pending.get(key)?.stamp || Infinity) <= acks.get(key)) pending.delete(key);
      } else if (area === 'sync' && (drafts.get(name)?.stamp || 0) <= (acks.get(name) || 0)) {
        actual[name] = change;
      }
    }
    notify(actual);
  });
  globalThis.baliSettingsStore = { get, set, subscribe: fn => listeners.add(fn) };
})();
