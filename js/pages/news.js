/* Markets Briefing (#/news), 21 Nov 2026: the day's market news from primary sources, written once a day by Claude in
   its own words (newsroom.py; GET /api/news/digest). The owner's brief: "a news page instead of traditional media,
   focused on financial markets", shown as an immersive space after two references he liked (websites as cards on a
   curved wall under a night sky; a tunnel of cards). Original design and code; no library, no downloaded asset.
     3D view   the night sky with an aurora and a dotted globe on a glowing floor (one WebGL fragment shader, drawn at
               half resolution, at most 30 frames a second, paused when hidden); the items as cards on a curved wall in
               two rows, ordered by section; the page's own scroll walks along the wall (a sticky stage), and the arrow
               keys, the index on the right, a click or Tab move to an item; Enter or a click opens it in a dialog.
               From 900 x 560 px with a mouse or trackpad, with WebGL and without a reduced-motion preference.
     list view the same items as plain cards by section: phones, tablets, reduced motion, no WebGL, or the reader's
               choice (remembered in this browser only). It is the first paint, and what screen readers read.
   Every item shows its source, its time (Berlin) and a link to the source. The site's line "paper money · educational ·
   not investment advice" is on the page. Nodes are built with h() only (no innerHTML with data). Styles: css/site.css. */
(function () {
  const ok = (x) => x != null && Number.isFinite(x);
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PREF = "sv-news-view";                         // "list" or "3d": a per-browser convenience, never required
  const KIND = { official: "Official source", company: "Company release", press: "News outlet", site: "Company site" };
  const LEGAL_LINE = "Facts, not investment advice · educational · a paper-money site";
  const newTab = () => h("span", { class: "sr-only" }, " (opens in a new tab)");
  const arrowOut = () => h("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", "stroke-width": 2,
    "stroke-linecap": "round", "aria-hidden": "true" }, h("path", { d: "M7 17L17 7M9 7h8v8" }));
  const BERLIN = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const BERLIN_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "short" });
  const LONG_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const HM = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = (f, d) => Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  /* "Fri 20 Nov, 09:30 Berlin", or "Fri 20 Nov" when the source gives a date only */
  function when(iso, dateOnly) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    if (dateOnly) { const p = parts(BERLIN_DAY, d); return `${p.weekday} ${p.day} ${p.month}`; }
    const p = parts(BERLIN, d);
    return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} Berlin`;
  }
  const dayOf = (s) => { const d = new Date(`${s}T12:00:00Z`); const p = parts(BERLIN_DAY, d); return `${p.weekday} ${p.day} ${p.month}`; };
  const pct = (x) => (ok(x) ? sign(x, fmt.p1) : "—");
  const pct2 = (x) => (ok(x) ? sign(x, fmt.p2) : "—");
  const toneOf = (x) => (x > 0.00005 ? "nw-up" : x < -0.00005 ? "nw-down" : null);
  const pad = (n) => String(n).padStart(2, "0");
  function pref(v) {
    try { if (v === undefined) return localStorage.getItem(PREF); localStorage.setItem(PREF, v); } catch (_) { /* private window */ }
    return null;
  }
  let GL_OK = null;
  function glOk() {
    if (GL_OK !== null) return GL_OK;
    try { const c = document.createElement("canvas"); GL_OK = !!(c.getContext("webgl") || c.getContext("experimental-webgl")); }
    catch (_) { GL_OK = false; }
    return GL_OK;
  }
  /* the 3D view is offered where it reads well and runs smoothly */
  const can3d = () => !still() && glOk() && matchMedia("(min-width: 900px) and (min-height: 560px) and (pointer: fine)").matches;
  const use3d = () => can3d() && pref() !== "list";

  /* ---------------------------------------------------------------- shared pieces */
  function flatten(D) {
    const out = [];
    (D.sections || []).forEach((s) => (s.items || []).forEach((it) => out.push(Object.assign({}, it, { sec: s.title, secId: s.id }))));
    out.forEach((it, i) => { it.n = i + 1; });
    return out;
  }
  function edition(D) {
    const d = new Date(D.generated_at);
    if (isNaN(d)) return "";
    const p = parts(LONG_DAY, d), t = parts(HM, d);
    return `${p.weekday} ${p.day} ${p.month} ${p.year} · written ${t.hour}:${t.minute} Berlin`;
  }
  function market(D, n = 3) {
    const m = D.moves;
    if (!m || !m.etf || !ok(m.etf.move)) return null;
    const chip = (x) => h("span", { class: "nw-chip", title: x.name }, h("span", { class: "t" }, x.ticker), h("span", { class: toneOf(x.move) }, pct(x.move)));
    const up = (m.up || []).slice(0, n), down = (m.down || []).slice(0, n);
    return h("div", { class: "nw-mkt" },
      h("p", {}, h("span", {}, "S&P 500 ETF ", h("b", { class: toneOf(m.etf.move) }, pct2(m.etf.move))),
        m.nasdaq && ok(m.nasdaq.move) ? h("span", {}, "· Nasdaq 100 ETF ", h("b", { class: toneOf(m.nasdaq.move) }, pct2(m.nasdaq.move))) : null,
        h("span", {}, `· ${dayOf(m.as_of)} close`)),
      up.length || down.length ? h("p", {}, h("span", { class: "k" }, "Biggest S&P 500 moves"), down.map(chip), up.map(chip)) : null);
  }
  const kindTag = (it) => h("span", { class: `nw-kind is-${it.kind}` }, KIND[it.kind] || "Source");
  const srcLink = (it, cls, text = "Source") => h("a", { href: it.url, target: "_blank", rel: "noopener", class: cls || null },
    text, " ", arrowOut(), newTab());
  const metaLine = (it) => `${it.source} · ${when(it.published, it.date_only)}`;
  function about(D) {
    const m = D.method || {};
    return h("section", { class: "nw-about", "aria-labelledby": "nw-about-h" },
      h("h2", { id: "nw-about-h" }, "How this page is made"),
      h("p", {}, "Once a day Claude, an AI model, reads the candidates from primary sources: the Federal Reserve, the European "
        + "Central Bank and the Bank of England, SEC filings (8-K) of S&P 500 companies, plus web searches for official "
        + "statistics and company releases. It writes each item in its own words, with its source, its time and a link. "
        + "Fixed rules then check every item (links, times, length, no quotations); headlines from the GDELT news index are "
        + "used only to discover stories and are never cited."),
      D.moves ? h("p", {}, `Market moves: ${D.moves.source}.`) : null,
      h("p", {}, LEGAL_LINE, ". Not affiliated with Anthropic, the sources or the companies named; check the source before relying on any figure."));
  }
  function watchList(D) {
    if (!(D.watch || []).length) return null;
    return h("section", { class: "nw-sec", "aria-labelledby": "nw-watch-h" },
      h("h2", { class: "nw-sec-h", id: "nw-watch-h" }, "Coming up"),
      h("ul", { class: "nw-watch" }, D.watch.map((w) => h("li", {},
        h("span", { class: "when" }, when(w.when, w.date_only)),
        h("span", {}, w.what, " · ", h("a", { href: w.url, target: "_blank", rel: "noopener" }, w.source || "Source", newTab()))))));
  }

  /* ---------------------------------------------------------------- the list view */
  function flatView(D, items, picked) {
    const secs = (D.sections || []).map((s) => h("section", { class: "nw-sec", "aria-labelledby": `nw-s-${s.id}` },
      h("h2", { class: "nw-sec-h", id: `nw-s-${s.id}` }, s.title, h("small", {}, `${s.items.length}`)),
      h("ol", { class: "nw-grid" }, items.filter((it) => it.secId === s.id).map((it) => h("li", {
        class: `nw-item${picked === it.id ? " is-picked" : ""}`, id: `nw-${it.id}` },
      h("p", { class: "nw-eyebrow" }, `${pad(it.n)} · ${it.sec}`),
      h("h3", {}, it.title),
      h("ul", { class: "nw-facts" }, it.facts.map((f) => h("li", {}, f))),
      it.why ? h("p", { class: "nw-why" }, h("b", {}, "Why it matters: "), it.why) : null,
      h("div", { class: "nw-src" }, h("span", { class: "nw-meta" }, metaLine(it), " ", kindTag(it)), srcLink(it)))))));
    const tools = can3d() ? h("div", { class: "nw-hero-tools" },
      h("button", { class: "nw-btn", type: "button", onclick: () => { pref("3d"); rerender(); } }, "Step into the 3D room")) : null;
    return h("div", { class: "nw-flat" },
      h("section", { class: "nw-hero", "aria-labelledby": "nw-h1" },
        h("div", { class: "nw-stars", "aria-hidden": "true" }),
        h("div", { class: "nw-hero-in" },
          h("p", { class: "nw-eyebrow" }, "Daily · from primary sources"),
          h("h1", { id: "nw-h1", tabindex: "-1" }, "Markets Briefing"),
          h("p", { class: "nw-edition" }, edition(D)),
          D.lede ? h("p", { class: "nw-lede" }, D.lede) : null,
          market(D),
          tools)),
      h("div", { class: "nw-body" }, secs, watchList(D), about(D)));
  }

  /* ---------------------------------------------------------------- the 3D view: geometry */
  const R = 1000;                         // the wall's radius (px, before perspective)
  const CW = 380, CH = 236;               // a card
  const STEP = 2 * Math.asin((CW / 2 + 28) / R);     // the angle between two cards
  const VIEW = 1.25;                      // cards further than this angle (rad) from the view are hidden
  const colOf = (i) => i;                 // one row at eye level: the sky above, the floor and the globe below

  const S = { D: null, items: [], el: null, mode: null, f: 0, target: 0, idx: -1, raf: 0, last: 0, step: 400, top0: 0,
    off: [], sky: null, cards: [], idxBtns: [], dlg: null, ring: null, hud: {}, dirty: true, t0: 0 };

  function listen(target, type, fn, opt) {
    target.addEventListener(type, fn, opt);
    S.off.push(() => target.removeEventListener(type, fn, opt));
  }
  /* where the camera looks (in cards) for a position f along the items */
  const camCol = (f) => Math.max(0, Math.min(S.items.length - 1, f));
  function cardTransform(i, on) {
    const a = colOf(i) * STEP;
    return `rotateY(${-a}rad) translateZ(${-R + (on ? 80 : 0)}px) scale(${on ? 1.05 : 1})`;
  }

  function view3d(D, items) {
    const n = items.length;
    S.cards = items.map((it, i) => h("li", {}, h("button", {
      class: "nw-card", type: "button", "data-i": i, style: `transform: ${cardTransform(i, false)}`,
      "aria-label": `${it.n} of ${n}, ${it.sec}: ${it.title}. ${metaLine(it)}`,
      onclick: () => { if (S.idx === i) openItem(i); else goTo(i); },
      onfocus: () => { if (S.idx !== i) goTo(i); },
    },
    h("span", { class: "top" }, h("span", { class: "nw-eyebrow" }, it.sec), h("span", { class: "num" }, pad(it.n))),
    h("span", { class: "ttl" }, it.title),
    it.facts[0] ? h("span", { class: "fact" }, it.facts[0]) : null,
    h("span", { class: "nw-meta" }, h("span", {}, metaLine(it)), kindTag(it)))));
    /* the section names, large and faint above their first column */
    const labels = [];
    items.forEach((it, i) => {
      if (i === 0 || items[i - 1].secId !== it.secId) {
        const a = colOf(i) * STEP;
        labels.push(h("div", { class: "nw-label", "aria-hidden": "true",
          style: `transform: rotateY(${-a}rad) translateZ(${-R - 60}px) translateY(${-CH / 2 - 78}px)` }, it.sec));
      }
    });
    S.ring = h("div", { class: "nw-ring" }, h("ol", { class: "nw-wall", "aria-label": "The day's items" }, S.cards), labels);
    S.idxBtns = [];
    const index = [];
    items.forEach((it, i) => {
      if (i === 0 || items[i - 1].secId !== it.secId) index.push(h("p", { class: "nw-idx-sec" }, it.sec));
      const b = h("button", { class: "nw-idx", type: "button", tabindex: "-1", onclick: () => goTo(i) }, it.title);
      S.idxBtns.push(b);
      index.push(b);
    });
    const hud = S.hud;
    hud.eyebrow = h("p", { class: "nw-eyebrow" });
    hud.title = h("p", { class: "nw-ttl" });
    hud.meta = h("p", { class: "nw-meta" });
    hud.src = h("a", { class: "nw-btn ghost", target: "_blank", rel: "noopener" }, "Source ", arrowOut(), newTab());
    hud.bar = h("i");
    const canvas = h("canvas", { class: "nw-sky", "aria-hidden": "true" });
    S.stage = h("div", { class: "nw-stage", role: "region", "aria-label": "Markets Briefing, 3D view" },
      canvas,
      h("div", { class: "nw-world" }, S.ring),
      h("div", { class: "nw-hud nw-hud-title" },
        h("p", { class: "nw-eyebrow" }, "Daily · from primary sources"),
        h("h1", { id: "nw-h1", tabindex: "-1" }, "Markets Briefing"),
        h("p", { class: "nw-edition" }, edition(D)),
        D.lede ? h("p", { class: "nw-lede" }, D.lede) : null),
      D.moves ? h("div", { class: "nw-hud nw-hud-mkt" }, market(D)) : null,
      h("nav", { class: "nw-hud nw-hud-list", "aria-hidden": "true" }, index),
      h("div", { class: "nw-hud nw-hud-focus" }, hud.eyebrow, hud.title, hud.meta,
        h("div", { class: "acts" }, h("button", { class: "nw-btn", type: "button", onclick: () => openItem(S.idx) }, "Open the item"), hud.src)),
      h("div", { class: "nw-hud nw-hud-help" },
        h("p", { class: "nw-keys" }, h("kbd", {}, "←"), " ", h("kbd", {}, "→"), " or scroll to move · ", h("kbd", {}, "Enter"), " opens"),
        h("button", { class: "nw-btn ghost", type: "button", onclick: () => { pref("list"); rerender(); } }, "List view")),
      h("div", { class: "nw-hud nw-progress", "aria-hidden": "true" }, hud.bar),
      h("p", { class: "nw-hud nw-hud-legal" }, LEGAL_LINE));
    S.scroller = h("div", { class: "nw-scroll" }, S.stage);
    S.canvas = canvas;
    return h("div", { class: "nw-3d" }, S.scroller, h("div", { class: "nw-after" }, watchList(D), about(D)));
  }

  /* the walk: each item is one step of the page's scroll */
  function measure() {
    if (!S.scroller) return;
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-bar-h")) || 56;
    S.bar = bar;
    S.step = Math.max(260, Math.min(520, Math.round(innerHeight * 0.48)));
    S.scroller.style.height = `${Math.round(innerHeight - bar + (S.items.length - 1) * S.step)}px`;
    S.top0 = S.scroller.getBoundingClientRect().top + scrollY - bar;
  }
  function fromScroll() {
    S.target = Math.max(0, Math.min(S.items.length - 1, (scrollY - S.top0) / S.step));
    wake();
  }
  function goTo(i, instant) {
    i = Math.max(0, Math.min(S.items.length - 1, i));
    if (S.mode !== "3d") return;
    S.target = i;
    window.scrollTo({ top: S.top0 + i * S.step, behavior: instant || still() ? "auto" : "smooth" });
    wake();
  }
  function setFocus(i) {
    if (i === S.idx) return;
    const prev = S.idx;
    S.idx = i;
    const it = S.items[i];
    [prev, i].forEach((k) => {
      const c = S.cards[k] && S.cards[k].firstChild;
      if (!c) return;
      c.classList.toggle("is-on", k === i);
      c.style.transform = cardTransform(k, k === i);
    });
    S.idxBtns.forEach((b, k) => b.setAttribute("aria-current", k === i ? "true" : "false"));
    const cur = S.idxBtns[i];
    if (cur && cur.parentNode) {
      const box = cur.parentNode, top = cur.offsetTop - box.clientHeight / 2;
      box.scrollTop = Math.max(0, top);
    }
    S.hud.eyebrow.textContent = `${pad(it.n)} / ${pad(S.items.length)} · ${it.sec}`;
    S.hud.title.textContent = it.title;
    S.hud.meta.replaceChildren(metaLine(it), " ", kindTag(it));
    S.hud.src.href = it.url;
  }
  function place() {
    const cam = camCol(S.f) * STEP;
    S.ring.style.transform = `translateZ(900px) rotateY(${cam}rad)`;
    S.cards.forEach((li, i) => {
      const d = Math.abs(colOf(i) * STEP - cam);
      const c = li.firstChild;
      const hide = d > VIEW;
      if (c.hidden !== hide) c.hidden = hide;
      c.classList.toggle("is-near", d > STEP * 0.5 && d <= STEP * 1.5);
      c.classList.toggle("is-far", d > STEP * 1.5);
    });
    S.hud.bar.style.transform = `scaleX(${S.items.length > 1 ? S.f / (S.items.length - 1) : 1})`;
    setFocus(Math.round(S.f));
  }
  function wake() {
    if (!S.raf && S.mode === "3d") S.raf = requestAnimationFrame(frame);
  }
  function frame(t) {
    S.raf = 0;
    if (S.mode !== "3d") return;
    const d = S.target - S.f;
    const moving = Math.abs(d) > 0.0005;
    S.f = moving ? S.f + d * (still() ? 1 : 0.14) : S.target;
    if (moving || S.dirty) { place(); S.dirty = false; }
    let again = moving;
    if (S.sky && !document.hidden) {
      if (t - S.last > 32) { S.sky.draw((t - S.t0) / 1000, camCol(S.f) * STEP); S.last = t; }
      again = true;                                       // the sky moves slowly on its own
    }
    if (again) S.raf = requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- the sky: one fragment shader */
  const VERT = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";
  const FRAG = `precision mediump float;
uniform vec2 uRes; uniform float uTime; uniform float uYaw;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * asp, uv.y);
  float hz = 0.30;
  vec3 col = mix(vec3(0.045, 0.085, 0.19), vec3(0.016, 0.026, 0.066), smoothstep(hz, 1.0, uv.y));
  vec2 sp = vec2(p.x + uYaw * 0.32, p.y) * 95.0;
  vec2 cell = floor(sp); vec2 fc = fract(sp) - 0.5; float hs = hash(cell);
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + hs * 2.5) + hs * 40.0);
  col += step(0.984, hs) * smoothstep(0.11, 0.0, length(fc)) * tw * vec3(0.86, 0.91, 1.0) * smoothstep(hz + 0.04, 0.62, uv.y);
  float ax = p.x + uYaw * 0.16;
  float a = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float wave = 0.09 * sin(ax * (0.85 + 0.35 * fk) + uTime * (0.035 + 0.02 * fk) + fk * 2.1) + 0.07 * (fbm(vec2(ax * 1.1 + fk * 7.0, uTime * 0.02)) - 0.5);
    float base = 0.66 + 0.07 * fk + wave;
    float d = uv.y - base;
    float rays = 0.45 + 0.55 * fbm(vec2(ax * 8.5 + fk * 13.0, uTime * 0.06));
    float body = smoothstep(-0.02, 0.02, d) * exp(-max(d, 0.0) * (4.6 + 2.4 * fk));
    a += body * rays * (0.62 - 0.16 * fk);
  }
  a *= 0.55 + 0.45 * smoothstep(0.15, 0.75, fbm(vec2(ax * 0.45, uTime * 0.01)));
  vec3 aur = mix(vec3(0.26, 0.62, 1.0), vec3(0.46, 0.42, 1.0), smoothstep(0.62, 0.98, uv.y));
  col += aur * a * 1.25 * smoothstep(hz, hz + 0.12, uv.y);
  if (uv.y < hz) {
    float fy = (hz - uv.y) / hz;
    vec3 fl = mix(vec3(0.035, 0.06, 0.13), vec3(0.012, 0.016, 0.035), fy);
    vec2 q = vec2(p.x / 1.15, (uv.y - hz * 0.42) * 2.4);
    fl += vec3(0.14, 0.34, 0.85) * exp(-dot(q, q) * 2.6) * 0.62;
    float gx = abs(fract((p.x + uYaw * 0.5) / (0.06 + fy * 0.5) ) - 0.5);
    fl += vec3(0.25, 0.5, 1.0) * smoothstep(0.03, 0.0, gx) * (1.0 - fy) * 0.05;
    col = fl;
  }
  col += vec3(0.30, 0.55, 1.0) * exp(-abs(uv.y - hz) * 70.0) * 0.16;
  vec2 gc = vec2(0.0, hz * 0.55); float gr = 0.145;
  vec2 g = (p - gc) / gr; float r2 = dot(g, g);
  if (r2 < 1.0) {
    float z = sqrt(1.0 - r2);
    float rot = uTime * 0.10 + uYaw * 0.8; float cr = cos(rot); float sr = sin(rot);
    vec3 m = vec3(g.x * cr + z * sr, g.y, -g.x * sr + z * cr);
    float lat = asin(clamp(m.y, -1.0, 1.0)); float lon = atan(m.x, m.z);
    vec2 gp = vec2(lon, lat) * (16.0 / 3.14159);
    float dotv = smoothstep(0.24 * cos(lat) + 0.02, 0.04, length(fract(gp) - 0.5));
    float rim = pow(1.0 - z, 2.2);
    vec3 gcol = vec3(0.02, 0.04, 0.10) + vec3(0.42, 0.70, 1.0) * dotv * (0.18 + 0.82 * z) * 0.85 + vec3(0.42, 0.70, 1.0) * rim * 0.75;
    col = mix(col, gcol, smoothstep(1.0, 0.96, r2));
  } else {
    col += vec3(0.30, 0.55, 1.0) * exp(-(sqrt(r2) - 1.0) * 5.0) * 0.10;
  }
  gl_FragColor = vec4(col, 1.0);
}`;
  function makeSky(canvas) {
    let gl;
    try { gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, powerPreference: "low-power" }); } catch (_) { gl = null; }
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    try {
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const uRes = gl.getUniformLocation(prog, "uRes"), uTime = gl.getUniformLocation(prog, "uTime"), uYaw = gl.getUniformLocation(prog, "uYaw");
      const sky = {
        size() {
          const k = 0.5 * Math.min(2, devicePixelRatio || 1);          // half resolution: the sky is soft
          const w = Math.max(2, Math.round(canvas.clientWidth * k)), hh = Math.max(2, Math.round(canvas.clientHeight * k));
          if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; gl.viewport(0, 0, w, hh); }
        },
        draw(t, yaw) {
          sky.size();
          gl.uniform2f(uRes, canvas.width, canvas.height);
          gl.uniform1f(uTime, t);
          gl.uniform1f(uYaw, yaw);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          if (!canvas.classList.contains("on")) canvas.classList.add("on");
        },
        drop() { const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); },
      };
      return sky;
    } catch (e) {
      console.warn("Markets Briefing: the 3D sky is off", e && e.message);
      return null;
    }
  }

  /* ---------------------------------------------------------------- an item, opened */
  function dialog() {
    if (S.dlg) return S.dlg;
    const d = { body: h("div", { class: "nw-dlg-in" }) };
    d.el = h("dialog", { class: "nw-dlg", "aria-labelledby": "nw-dlg-h", onclose: () => {
      if (S.idx >= 0 && S.mode === "3d") { const c = S.cards[S.idx] && S.cards[S.idx].firstChild; if (c) c.focus({ preventScroll: true }); }
      if (/[?&]story=/.test(location.hash)) history.replaceState(history.state, "", `${location.pathname}${location.search}#/news`);
    } }, d.body);
    d.el.addEventListener("click", (e) => { if (e.target === d.el) d.el.close(); });
    S.el.append(d.el);
    S.dlg = d;
    return d;
  }
  function openItem(i) {
    const it = S.items[i];
    if (!it) return;
    const d = dialog();
    const n = S.items.length;
    const step = (k) => { const j = (i + k + n) % n; if (S.mode === "3d") goTo(j); fill(j); };
    const fill = (j) => {
      const x = S.items[j];
      i = j;
      d.body.replaceChildren(
        h("div", { class: "nw-dlg-head" }, h("p", { class: "nw-eyebrow" }, `${pad(x.n)} / ${pad(n)} · ${x.sec}`),
          h("button", { class: "nw-x", type: "button", "aria-label": "Close", onclick: () => d.el.close() }, icon("close", 16))),
        h("h2", { id: "nw-dlg-h" }, x.title),
        h("ul", { class: "nw-facts" }, x.facts.map((f) => h("li", {}, f))),
        x.why ? h("p", { class: "nw-why" }, h("b", {}, "Why it matters: "), x.why) : null,
        h("p", { class: "nw-meta" }, metaLine(x), " ", kindTag(x)),
        h("div", { class: "nw-dlg-acts" },
          srcLink(x, "nw-btn", "Read the source"),
          h("span", { class: "sp" }),
          n > 1 ? h("button", { class: "nw-btn ghost", type: "button", onclick: () => step(-1) }, "‹ Previous") : null,
          n > 1 ? h("button", { class: "nw-btn ghost", type: "button", onclick: () => step(1) }, "Next ›") : null));
      history.replaceState(history.state, "", `${location.pathname}${location.search}#/news?story=${x.id}`);
    };
    fill(i);
    if (!d.el.open) d.el.showModal();
    const first = d.body.querySelector("a.nw-btn");
    if (first) first.focus();
  }

  /* ---------------------------------------------------------------- the page */
  function onKey(e) {
    if (S.mode !== "3d" || (S.dlg && S.dlg.el.open) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowDown") { e.preventDefault(); goTo(S.idx + 1); }
    else if (k === "ArrowLeft" || k === "ArrowUp") { e.preventDefault(); goTo(S.idx - 1); }
    else if (k === "Home" && e.target === document.body) { e.preventDefault(); goTo(0); }
    else if (k === "End" && e.target === document.body) { e.preventDefault(); goTo(S.items.length - 1); }
    else if (k === "Enter" && !(e.target.closest && e.target.closest("a, button"))) { e.preventDefault(); openItem(S.idx); }
  }
  function start3d() {
    measure();
    fromScroll();
    S.f = S.target;
    S.dirty = true;
    listen(window, "scroll", fromScroll, { passive: true });
    listen(window, "keydown", onKey);
    listen(S.stage, "scroll", () => { S.stage.scrollTop = 0; S.stage.scrollLeft = 0; });     // focus never shifts the stage
    listen(document, "visibilitychange", () => { if (!document.hidden) wake(); });
    wake();
    /* the sky after the first paint: the stage shows its gradient until then */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (S.mode !== "3d") return;
      S.sky = makeSky(S.canvas);
      S.t0 = performance.now();
      wake();
    }));
  }
  function stop() {
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
    S.off.forEach((f) => f());
    S.off = [];
    if (S.sky) S.sky.drop();
    S.sky = null;
    if (S.dlg && S.dlg.el.open) S.dlg.el.close();
    S.dlg = null;
    S.mode = null;
    S.idx = -1;
  }
  function draw(picked) {
    stop();
    const D = S.D, items = S.items;
    if (!D || D.state !== "live" || !items.length) {
      S.el.replaceChildren(h("div", { class: "nw-flat" }, h("div", { class: "nw-empty" },
        h("p", { class: "nw-eyebrow" }, "Markets Briefing"),
        h("h1", { id: "nw-h1", style: "margin:10px 0 6px;font-size:26px" }, "The first edition is on its way"),
        h("p", { class: "nw-note" }, "A new edition is written every morning from primary sources. ", LEGAL_LINE, "."))));
      return;
    }
    if (use3d()) {
      S.mode = "3d";
      S.el.replaceChildren(view3d(D, items));
      start3d();
      const j = picked ? items.findIndex((x) => x.id === picked) : -1;
      if (j >= 0) { goTo(j, true); setTimeout(() => openItem(j), 50); }
    } else {
      S.mode = "list";
      S.el.replaceChildren(flatView(D, items, picked));
      const card = picked && document.getElementById(`nw-${picked}`);
      if (card) setTimeout(() => card.scrollIntoView({ block: "center", behavior: still() ? "auto" : "smooth" }), 60);
    }
    /* the view follows the window: the 3D room needs room, a mouse and motion */
    let was = use3d(), t = null;
    listen(window, "resize", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (use3d() !== was) { was = use3d(); draw(); return; }
        if (S.mode === "3d") { measure(); fromScroll(); S.dirty = true; wake(); }
      }, 150);
    });
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => { if (use3d() !== was) { was = use3d(); draw(); } };
    if (mq.addEventListener) { mq.addEventListener("change", onMq); S.off.push(() => mq.removeEventListener("change", onMq)); }
  }
  function rerender() {
    window.scrollTo(0, 0);
    draw();
    const t = document.getElementById("nw-h1");
    if (t) t.focus({ preventScroll: true });
  }

  Pages.news = {
    title: "Markets Briefing",
    async render(el, params) {
      S.el = el;
      el.replaceChildren(h("div", { class: "nw-flat" }, h("div", { class: "nw-hero" }, h("div", { class: "nw-hero-in" },
        h("p", { class: "nw-eyebrow" }, "Daily · from primary sources"), h("h1", { id: "nw-h1" }, "Markets Briefing"),
        h("p", { class: "nw-edition" }, "Loading the latest edition…")))));
      let D = null;
      try { D = await api("/api/news/digest"); } catch (_) { D = null; }
      if (!el.isConnected || Router.current !== "news") return;
      S.D = D;
      S.items = D ? flatten(D) : [];
      document.title = "Markets Briefing · SV Terminal";
      draw(params && params.get("story"));
    },
    /* #/news?story=<id> while the page is open: open that item, nothing reloads */
    update(params) {
      const id = params && params.get("story");
      const j = id ? S.items.findIndex((x) => x.id === id) : -1;
      if (j >= 0) { if (S.mode === "3d") { goTo(j); openItem(j); } else draw(id); }
      return true;
    },
    leave() {
      stop();
      S.el = null;
      S.ring = null;
      S.cards = [];
      S.idxBtns = [];
    },
  };
})();
