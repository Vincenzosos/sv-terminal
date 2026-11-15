"use strict";
/* SV Terminal · public snapshot, part 1 of 2: the data layer. The public site is one read-only page, the Claude Portfolio
   (#/cp), paper money only. publish.py loads this file BEFORE core.js on the published site; the app on the Mac never
   loads it.
   - BussolaNorm: the key of an "/api/…" URL, the same rule as publish.norm_url (tests/test_publish.py runs this file in
     Node to compare the two).
   - A fetch shim for "/api/…" GETs: an answer comes from data/p/<sha1(key)>.json, listed in data/index.json (a paged
     answer may be stored as its differences from page one: BussolaDelta puts it back together). A URL the snapshot does
     not hold answers 404 "Not in this snapshot". Anything but a GET answers 405: the snapshot is read-only.
   - No live stream: EventSource never connects and /api/stream answers 404 (js/lock.js also turns Live.connect off).
   - The site's bare address opens the page (#/cp). */

/* ================================================================ URL keys (the same rule as publish.norm_url) */
(function (root) {
  /* path + query with the parameters sorted by name, decoded and re-encoded one way; an empty query is dropped */
  function normUrl(u) {
    let s = String(u);
    const api = s.indexOf("/api/");
    if (api > 0 && /^[a-z]+:\/\//i.test(s)) s = s.slice(api);
    const hash = s.indexOf("#");
    if (hash >= 0) s = s.slice(0, hash);
    const qi = s.indexOf("?");
    const path = qi >= 0 ? s.slice(0, qi) : s;
    const query = qi >= 0 ? s.slice(qi + 1) : "";
    const dec = (x) => { try { return decodeURIComponent(x.replace(/\+/g, " ")); } catch (_) { return x; } };
    const pairs = query.split("&").filter(Boolean).map((p) => { const i = p.indexOf("="); return i < 0 ? [dec(p), ""] : [dec(p.slice(0, i)), dec(p.slice(i + 1))]; });
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const q = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    return q ? `${path}?${q}` : path;
  }
  root.BussolaNorm = normUrl;
  /* publish.delta_pack stores page 2, 3… of a paged answer as {"$delta":1,"$base":<file>,"set":{…},"drop":[…]}: the
     fields that differ from the same URL without the page (or filter) parameter. This puts the answer back together. */
  root.BussolaDelta = {
    is: (text) => typeof text === "string" && text.startsWith('{"$delta":'),
    base: (text) => JSON.parse(text).$base,
    merge(baseText, deltaText) {
      const d = JSON.parse(deltaText), out = JSON.parse(baseText);
      for (const k of d.drop || []) delete out[k];
      return JSON.stringify(Object.assign(out, d.set || {}));
    },
  };
})(typeof window !== "undefined" ? window : globalThis);

/* ================================================================ the shim (browser only) */
(function () {
  if (typeof window === "undefined" || !window.document) return;
  const ORIG = window.fetch.bind(window);
  /* misses and refused: the last 200 URLs answered "Not in this snapshot" and the last 200 writes refused (for a look in
     the console) */
  const S = window.BussolaStatic = { index: null, indexError: null, misses: [], refused: [] };
  /* the one page is the front page (#/ lands there) */
  if (!location.hash || location.hash === "#" || location.hash === "#/") history.replaceState(null, "", `${location.pathname}${location.search}#/cp`);
  S.ready = ORIG("data/index.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(`data/index.json: HTTP ${r.status}`); return r.json(); })
    .then((d) => { S.index = d; return d; })
    .catch((e) => { S.indexError = e.message; S.index = { public: {} }; return S.index; });
  const note = (list, key) => { list.push(key); if (list.length > 200) list.splice(0, list.length - 200); };
  const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  const cache = new Map();                            // public files already fetched in this tab
  const D = window.BussolaDelta;
  async function publicFile(h, depth = 0) {
    let body = cache.get(h);
    if (body != null) return body;
    /* ?v= the snapshot's time: one browser-cache entry per snapshot (GitHub Pages ignores the query) */
    const r = await ORIG(`data/p/${h}.json?v=${encodeURIComponent(S.index.built || "")}`);
    if (!r.ok) throw new Error(`Snapshot file missing (HTTP ${r.status})`);
    body = await r.text();
    if (D.is(body)) {
      if (depth > 2) throw new Error("Snapshot file damaged");
      body = D.merge(await publicFile(D.base(body), depth + 1), body);
    }
    cache.set(h, body);
    return body;
  }
  window.fetch = async function (input, opts) {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    if (raw == null || !(raw.startsWith("/api/") || raw.startsWith(`${location.origin}/api/`))) return ORIG(input, opts);
    const method = String((opts && opts.method) || "GET").toUpperCase();
    const key = window.BussolaNorm(raw);
    if (method !== "GET") {
      note(S.refused, `${method} ${key}`);
      return json({ error: "This is a read-only public snapshot: nothing can be changed or sent from here." }, 405);
    }
    if (key.startsWith("/api/stream")) return json({ error: "No live stream in the public snapshot" }, 404);
    await S.ready;
    const pub = (S.index.public || {})[key];
    if (pub) {
      let body;
      try { body = await publicFile(pub[0]); } catch (e) { return json({ error: e.message }, 502); }
      return new Response(body, { status: pub[1] || 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    note(S.misses, key);
    return json({ error: "Not in this snapshot" }, 404);
  };
  /* no live stream in a snapshot (lock.js also turns Live.connect off) */
  window.EventSource = class SnapshotNoStream { constructor() { this.readyState = 2; } close() {} addEventListener() {} };
})();
