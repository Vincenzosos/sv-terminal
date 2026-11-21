/* Markets Briefing (#/news), v2 of 21 Nov 2026. The owner: a news page "instead of traditional media", focused on
   financial markets, after two references (websites as cards on a curved wall under a night sky; a tunnel of cards),
   then "much, much more", and "exceptional, and clean: no extra stuff". Original design and code; no library, no
   downloaded asset. The data: GET /api/news/digest (newsroom.py): the day's stories written by Claude from primary
   sources, the markets board (Lang & Schwarz, FRED), the wire (every central bank release and S&P 500 8-K, no AI).
     Room     a night sky with an aurora and a dotted globe on a glowing floor (one WebGL fragment shader at half
              resolution, at most 30 frames a second, paused when hidden; the globe turns to the focused story's
              financial centre); a curved wall around the viewer: the markets on top, the stories at eye level, the
              wire below. The page's scroll walks the wall (a sticky stage); arrows, a drag, the list on the right or
              Tab move to a story; Enter or a click opens it.
     Tunnel   every card on rings that come towards the viewer as the page scrolls: the markets, the stories, the wire.
     List     the same content as a plain page: phones, tablets, reduced motion, no WebGL, or the reader's choice
              (remembered in this browser only). It is also what screen readers get first.
   Clean on purpose: a title and a date, the focused story, a quiet list, the view switch and one legal line; the
   content is on the wall. Every story and wire line shows its source and time and links to the source. Nodes are
   built with h() only. Styles: css/site.css. */
(function () {
  const ok = (x) => x != null && Number.isFinite(x);
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PREF = "sv-news-view";
  const LEGAL = "Facts, not investment advice · educational · paper-money site · summaries by Claude, an AI model";
  const newTab = () => h("span", { class: "sr-only" }, " (opens in a new tab)");
  const arrowOut = () => h("svg", { viewBox: "0 0 24 24", width: 13, height: 13, fill: "none", stroke: "currentColor", "stroke-width": 2,
    "stroke-linecap": "round", "aria-hidden": "true" }, h("path", { d: "M7 17L17 7M9 7h8v8" }));
  const fmtTZ = (o) => new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: "Europe/Berlin", hourCycle: "h23" }, o));
  const F_TIME = fmtTZ({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const F_DAY = fmtTZ({ weekday: "short", day: "numeric", month: "short" });
  const F_LONG = fmtTZ({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const F_HM = fmtTZ({ hour: "2-digit", minute: "2-digit" });
  const parts = (f, d) => Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  function when(iso, dateOnly) {
    const d = new Date(dateOnly && /^\d{4}-\d\d-\d\d$/.test(iso || "") ? `${iso}T12:00:00Z` : iso);
    if (isNaN(d)) return "";
    if (dateOnly) { const p = parts(F_DAY, d); return `${p.weekday} ${p.day} ${p.month}`; }
    const p = parts(F_TIME, d);
    return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
  }
  const dayOf = (s) => when(s, true);
  const pct = (x, f = fmt.p1) => (ok(x) ? sign(x, f) : "—");
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
  /* the room everywhere, phones included (the owner, 21 Nov 2026: "the phone must be like the PC"); the list for reduced
     motion, no WebGL or the reader's choice */
  const can3d = () => !still() && glOk();
  const compact = () => innerWidth < 700;
  const view = () => { const p = pref(); return !can3d() ? "list" : p === "tunnel" || p === "list" ? p : "room"; };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ---------------------------------------------------------------- data */
  function flatten(D) {
    const out = [];
    (D.sections || []).forEach((s) => (s.items || []).forEach((it) => out.push(Object.assign({}, it, { sec: s.title, secId: s.id }))));
    out.forEach((it, i) => { it.n = i + 1; });
    return out;
  }
  function edition(D) {
    const d = new Date(D.generated_at);
    if (isNaN(d)) return "";
    const p = parts(F_LONG, d), t = parts(F_HM, d);
    return `${p.weekday} ${p.day} ${p.month} ${p.year} · ${t.hour}:${t.minute} Berlin`;
  }
  const meta = (it) => `${it.source} · ${when(it.published, it.date_only)}`;
  const wireTag = (w) => (w.kind === "filing" ? "SEC filing" : String(w.source || "").replace(/^Federal Reserve Board$/, "Federal Reserve"));
  /* a tile's figure: the level for a rate, a yield or Brent; otherwise the change (a fund's price is not the index) */
  function tileFigures(t) {
    const chg = ok(t.change_bp) ? `${t.change_bp > 0 ? "+" : t.change_bp < 0 ? MINUS : ""}${Math.abs(t.change_bp)} bp` : pct(t.change, fmt.p2);
    const tone = ok(t.change_bp) ? toneOf(t.change_bp) : toneOf(t.change);
    let level = null;
    if (t.show_last && ok(t.last)) level = t.unit === "%" ? `${t.last.toFixed(2)}%` : t.unit === "$" ? `$${t.last.toFixed(2)}` : t.last.toFixed(4);
    return { chg, tone, level };
  }


  /* a company's mark: its logo (logos.py, logos/index.json) or a monogram of its ticker */
  let LOGOS = new Set();
  const mark = (t, cls = "") => (!t ? null : LOGOS.has(t)
    ? h("img", { class: `nw-logo ${cls}`, src: `logos/${t.replace(".", "_")}.png`, alt: "", width: 64, height: 64, loading: "lazy", decoding: "async" })
    : h("span", { class: `nw-mono ${cls}`, "aria-hidden": "true" }, t.replace(/\..*$/, "").slice(0, 4)));
  const tickerOf = (it) => (it.spark && it.spark.ticker) || (it.tickers || [])[0] || null;

  /* ---------------------------------------------------------------- the pieces, shared by the three views */
  function tileBody(t) {
    const f = tileFigures(t);
    return [h("span", { class: "nw-t-label" }, t.label),
      f.level ? h("span", { class: "nw-t-fig" }, f.level, h("small", { class: f.tone }, f.chg)) : h("span", { class: `nw-t-fig ${f.tone || ""}` }, f.chg)];
  }
  const openMarket = (i) => ((S.D.board || [])[i] && S.D.board[i].key === "spx" && S.D.map ? openMap() : openTile(i));
  /* the story's key figure, as its title (or first fact) writes it: an amount, a percentage or basis points */
  const FIGURE = /(?:US)?[$€£]\s?\d[\d,.]*(?:\s?(?:billion|million|trillion))?|[+−-]?\d[\d,.]*\s?%|\d+\s?(?:basis points|bp)\b/i;
  const keyFigure = (it) => { const m = FIGURE.exec(it.title) || FIGURE.exec(it.facts[0] || ""); return m ? m[0].trim() : null; };
  function storyBody(it, rich) {
    const fig = rich ? keyFigure(it) : null, sp = rich && it.spark;
    const tk = rich ? tickerOf(it) : null;
    return [h("span", { class: "nw-c-head" }, tk ? mark(tk) : null, h("span", { class: "nw-c-eye" }, `${it.sec} · ${when(it.published, it.date_only)}`)),
      fig ? h("span", { class: "nw-c-fig" }, fig) : null,
      h("span", { class: `nw-c-ttl${fig ? " is-short" : ""}` }, it.title),
      !fig && it.facts[0] ? h("span", { class: "nw-c-fact" }, it.facts[0]) : null,
      h("span", { class: "nw-c-foot" }, h("span", { class: "nw-c-src" }, it.source),
        sp ? h("span", { class: "nw-c-tick" }, h("b", {}, sp.ticker), h("span", { class: toneOf(sp.change) }, pct(sp.change))) : null)];
  }
  function wireBody(w) {
    return [h("span", { class: "nw-c-head" }, w.ticker ? mark(w.ticker, "is-small") : null, h("span", { class: "nw-c-eye" }, `${wireTag(w)} · ${when(w.time, w.date_only)}`)),
      h("span", { class: "nw-c-ttl" }, w.title)];
  }

  /* ---------------------------------------------------------------- the map: a squarified treemap */
  function squarify(items, x, y, w, hgt) {
    const out = [];
    let rest = items.filter((it) => it.v > 0).sort((a, b) => b.v - a.v);
    const total = rest.reduce((a, b) => a + b.v, 0);
    if (!total || w <= 0 || hgt <= 0) return out;
    const k = (w * hgt) / total;
    const worst = (row, side) => {
      const s = row.reduce((a, b) => a + b.v * k, 0), mx = Math.max(...row.map((r) => r.v * k)), mn = Math.min(...row.map((r) => r.v * k));
      return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    while (rest.length) {
      const side = Math.min(w, hgt);
      const row = [rest[0]];
      let i = 1;
      while (i < rest.length && worst(row.concat(rest[i]), side) <= worst(row, side)) row.push(rest[i++]);
      const s = row.reduce((a, b) => a + b.v * k, 0);
      if (w >= hgt) {
        const rw = s / hgt;
        let yy = y;
        row.forEach((r) => { const rh = (r.v * k) / rw; out.push(Object.assign({}, r, { x, y: yy, w: rw, h: rh })); yy += rh; });
        x += rw; w -= rw;
      } else {
        const rh = s / w;
        let xx = x;
        row.forEach((r) => { const rw2 = (r.v * k) / rh; out.push(Object.assign({}, r, { x: xx, y, w: rw2, h: rh })); xx += rw2; });
        y += rh; hgt -= rh;
      }
      rest = rest.slice(row.length);
    }
    return out;
  }
  /* a move's colour: graphite at zero, deepening to green or red by 3% (a signed number: the one place for them) */
  function heat(m) {
    const t = Math.min(1, Math.abs(m || 0) / 0.03) ** 0.75;
    const base = [34, 38, 46], to = m >= 0 ? [28, 150, 86] : [196, 50, 58];
    const c = base.map((b, i) => Math.round(b + (to[i] - b) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }
  function mapView(mp, focus, cls) {
    const box = h("div", { class: `nw-map ${cls || ""}`, role: "img", "aria-label": `Map of the ${mp.n} largest S&P 500 companies on ${dayOf(mp.as_of)}: ` +
      mp.sectors.map((x) => `${x.name} ${pct(x.move)}`).join(", ") });
    const drawMap = () => {
      const W = box.clientWidth, H = box.clientHeight;
      if (!W || !H) return;
      const nodes = [];
      squarify(mp.sectors.map((x) => ({ v: x.cap, sec: x })), 0, 0, W, H).forEach((sr) => {
        const head = sr.h > 46 && sr.w > 70 ? 17 : 0;
        nodes.push(h("div", { class: "nw-msec", style: `left:${sr.x}px;top:${sr.y}px;width:${sr.w}px;height:${sr.h}px` },
          head ? h("span", { class: "nw-msec-h" }, sr.sec.name, " ", h("span", {}, pct(sr.sec.move))) : null));
        squarify(mp.rows.filter((r) => r.s === sr.sec.name).map((r) => ({ v: r.c, r })), sr.x + 1, sr.y + head + 1, sr.w - 2, sr.h - head - 2).forEach((c) => {
          const big = Math.max(9, Math.min(22, Math.min(c.w / 4.4, c.h / 2.6)));
          const show = c.w > 34 && c.h > 22;
          nodes.push(h("button", { type: "button", class: `nw-mbox${focus && c.r.t === focus ? " is-focus" : ""}`, title: `${c.r.n} (${c.r.t}) ${pct(c.r.m)}`,
            "aria-label": `${c.r.n}, ${pct(c.r.m)}`, onclick: () => openCompany(c.r.t),
            style: `left:${c.x + 1}px;top:${c.y + 1}px;width:${Math.max(0, c.w - 2)}px;height:${Math.max(0, c.h - 2)}px;background:${heat(c.r.m)};font-size:${big.toFixed(1)}px` },
          show ? [h("b", {}, c.r.t), c.h > 36 ? h("span", {}, pct(c.r.m)) : null] : null));
        });
      });
      box.replaceChildren(...nodes);
    };
    requestAnimationFrame(drawMap);
    if ("ResizeObserver" in window) { let t = null; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(drawMap, 120); }).observe(box); }
    return box;
  }
  const legend = () => h("p", { class: "nw-legend", "aria-hidden": "true" }, ["−3%", "−2%", "−1%", "0%", "+1%", "+2%", "+3%"].map((x, i) =>
    h("span", { style: `background:${heat((i - 3) / 100)}` }, x)));

  /* ---------------------------------------------------------------- the list view */
  function listView(D) {
    const tiles = (D.board || []).map((t, i) => h("li", {}, h("button", { class: "nw-mk", type: "button", onclick: () => openMarket(i) }, tileBody(t))));
    const mv = D.moves ? [...(D.moves.down || []), ...(D.moves.up || [])] : [];
    const movers = mv.length ? h("p", { class: "nw-movers" }, h("span", { class: "k" }, `Biggest S&P 500 moves, ${dayOf(D.moves.as_of)}`),
      mv.slice(0, 10).map((x) => h("span", { class: "nw-chip", title: x.name }, h("b", {}, x.ticker), " ", h("span", { class: toneOf(x.move) }, pct(x.move))))) : null;
    const secs = (D.sections || []).map((s) => h("section", { class: "nw-sec", "aria-labelledby": `nw-s-${s.id}` },
      h("h2", { class: "nw-sec-h", id: `nw-s-${s.id}` }, s.title),
      h("ol", { class: "nw-grid" }, S.stories.filter((it) => it.secId === s.id).map((it) => h("li", { class: "nw-item", id: `nw-${it.id}` },
        h("p", { class: "nw-c-eye" }, when(it.published, it.date_only)),
        h("h3", {}, h("button", { class: "nw-link", type: "button", onclick: () => openStory(it.n - 1) }, it.title)),
        h("ul", { class: "nw-facts" }, it.facts.map((f) => h("li", {}, f))),
        it.why ? h("p", { class: "nw-why" }, it.why) : null,
        h("p", { class: "nw-src" }, h("a", { href: it.url, target: "_blank", rel: "noopener" }, it.source, " ", arrowOut(), newTab())))))));
    const rows = (list, f) => h("ol", { class: "nw-wire" }, list.map(f));
    const wire = (D.wire || []).length ? h("section", { class: "nw-sec", "aria-labelledby": "nw-wire-h" },
      h("h2", { class: "nw-sec-h", id: "nw-wire-h" }, "The wire", h("small", {}, "every central bank release and S&P 500 current report, unedited")),
      rows(D.wire, (w) => h("li", {}, h("span", { class: "nw-w-when" }, when(w.time, w.date_only)), h("span", { class: "nw-w-tag" }, wireTag(w)),
        h("a", { href: w.url, target: "_blank", rel: "noopener" }, w.title, newTab())))) : null;
    const watch = (D.watch || []).length ? h("section", { class: "nw-sec", "aria-labelledby": "nw-watch-h" },
      h("h2", { class: "nw-sec-h", id: "nw-watch-h" }, "Coming up"),
      rows(D.watch, (w) => h("li", {}, h("span", { class: "nw-w-when" }, when(w.when, w.date_only)), h("span", { class: "nw-w-tag" }, w.source || ""),
        h("a", { href: w.url, target: "_blank", rel: "noopener" }, w.what, newTab())))) : null;
    return h("div", { class: "nw-flat" },
      h("header", { class: "nw-hero" }, h("div", { class: "nw-stars", "aria-hidden": "true" }), h("div", { class: "nw-hero-in" },
        h("h1", { id: "nw-h1", tabindex: "-1" }, "Markets Briefing"),
        h("p", { class: "nw-edition" }, edition(D)),
        D.lede ? h("p", { class: "nw-lede" }, D.lede) : null,
        can3d() ? h("div", { class: "nw-views-inline" }, viewSwitch()) : null)),
      h("div", { class: "nw-body" },
        tiles.length ? h("section", { class: "nw-sec", "aria-labelledby": "nw-mk-h" }, h("h2", { class: "nw-sec-h", id: "nw-mk-h" }, "Markets",
          h("small", {}, `${dayOf((D.board[0] || {}).as_of)} close`)), h("ol", { class: "nw-mks" }, tiles)) : null,
        D.map ? h("section", { class: "nw-sec", "aria-labelledby": "nw-map-h" }, h("h2", { class: "nw-sec-h", id: "nw-map-h" }, "The S&P 500 map",
          h("small", {}, `${D.map.n} largest companies, sized by market value, coloured by ${dayOf(D.map.as_of)}'s move`)),
          mapView(D.map, null, "nw-map-inline"), legend(), movers) : movers,
        secs, wire, watch, footer()));
  }
  const aboutBtn = () => h("button", { class: "nw-link", type: "button", onclick: () => openAbout() }, "Sources and method");
  const footer = () => h("footer", { class: "nw-foot" }, h("p", {}, LEGAL, " · ", aboutBtn()));
  function viewSwitch() {
    const b = (v, label) => h("button", { type: "button", "aria-pressed": String(S.mode === v), onclick: () => { if (S.mode !== v) { pref(v); rerender(); } } }, label);
    return h("div", { class: "nw-views", role: "group", "aria-label": "View" }, b("room", "Room"), b("tunnel", "Tunnel"), b("list", "List"));
  }

  /* ---------------------------------------------------------------- 3D: shared state */
  const S = { D: null, stories: [], el: null, mode: null, f: 0, target: 0, idx: -1, raf: 0, last: 0, step: 400, top0: 0,
    off: [], sky: null, nodes: [], dlg: null, hud: {}, dirty: true, t0: 0, rot: 0, rotTarget: 0, mark: -1, drag: null, idxBtns: [],
    px: 0, py: 0, pt: null, pre: false };
  function listen(target, type, fn, opt) {
    target.addEventListener(type, fn, opt);
    S.off.push(() => target.removeEventListener(type, fn, opt));
  }
  /* the region of a story → the longitude the globe turns to, and which centres light up */
  const REGION = { US: [-74, 0], UK: [-0.1, 1], Europe: [8.7, 2], Asia: [130, 4], Global: [null, -1] };
  const CENTRES = [[40.7, -74.0, 0], [38.9, -77.0, 0], [51.5, -0.1, 1], [50.1, 8.7, 2], [35.7, 139.7, 4], [22.3, 114.2, 4]];

  /* ---------------------------------------------------------------- the room */
  let R = 1150, PERSP = 900;
  let SZ = { story: 380, tile: 220, wire: 282 };
  function geometry() {
    const c = compact();
    R = c ? 760 : 1150;
    PERSP = c ? 620 : 900;
    SZ = c ? { story: 290, tile: 150, wire: 236 } : { story: 380, tile: 220, wire: 282 };
    ROW_Y = c ? { tile: -(206 / 2 + 22 + 70 / 2), story: 0, wire: 206 / 2 + 22 + 92 / 2 } : { tile: -(236 / 2 + 26 + 90 / 2), story: 0, wire: 236 / 2 + 30 + 112 / 2 };
  }
  const minStep = (w, gap) => 2 * Math.asin((w / 2 + gap) / R);
  let ROW_Y = { tile: -(236 / 2 + 26 + 90 / 2), story: 0, wire: 236 / 2 + 30 + 112 / 2 };
  function roomLayout(D) {
    const stops = 1 + S.stories.length;                  // the cover, then the stories: the walk's stops
    const nT = (D.board || []).length;
    const sM = minStep(SZ.story, 34), sT = minStep(SZ.tile, 16), sW = minStep(SZ.wire, 14);
    let A = Math.max((stops - 1) * sM, (nT - 1) * sT, 2.6);
    A = Math.min(A, 2 * Math.PI - sM);
    const stepM = stops < 2 ? 0 : Math.max(sM, A / (stops - 1));
    /* left of the cover: the biggest moves and the calendar, so the room is full from the first look; the markets and
       the wire run from there to the last story */
    const side = [D.moves && ((D.moves.up || []).length || (D.moves.down || []).length) ? "movers" : null, (D.watch || []).length ? "watch" : null].filter(Boolean);
    const start = -side.length * Math.max(stepM, sM), span = A - start;
    const nW = Math.min((D.wire || []).length, 1 + Math.floor(span / sW));
    const at = (n, i, smin) => (n < 2 ? start : start + i * Math.max(smin, span / (n - 1)));
    return { A, stops, stepM, nW, side, sideAt: (k) => -(k + 1) * Math.max(stepM, sM), tileAt: (i) => at(nT, i, sT), wireAt: (i) => at(nW, i, sW) };
  }
  const place3 = (a, y, z = 0, s = 1) => `rotateY(${-a}rad) translateZ(${-R + z}px) translateY(${y}px) scale(${s})`;
  function buildRoom(D) {
    geometry();
    const L = (S.L = roomLayout(D));
    S.nodes = [];
    const cover = h("button", { class: "nw-card nw-cover", type: "button", "aria-label": `Today, ${edition(D)}. ${D.lede || ""}`,
      onclick: () => goTo(S.idx === 0 ? 1 : 0), onfocus: () => { if (S.idx !== 0) goTo(0); } },
    h("span", { class: "nw-c-eye" }, "Today"), h("span", { class: "nw-cover-day" }, edition(D).split(" · ")[0]),
    D.lede ? h("span", { class: "nw-c-fact" }, D.lede) : null,
    h("span", { class: "nw-c-src" }, `${S.stories.length} stories · ${(D.board || []).length} markets · ${(D.wire || []).length} on the wire`));
    S.nodes.push({ el: cover, a: 0, y: ROW_Y.story, kind: "stop", stop: 0 });
    L.side.forEach((what, k) => {
      let el;
      if (what === "movers") {
        const mv = [...(D.moves.down || []).slice(0, 3), ...(D.moves.up || []).slice(0, 3)];
        el = h("div", { class: "nw-card nw-side", "aria-hidden": "true" }, h("span", { class: "nw-c-eye" }, `Biggest S&P 500 moves · ${dayOf(D.moves.as_of)}`),
          h("span", { class: "nw-rows" }, mv.map((x) => h("span", { class: "nw-row" }, h("b", {}, x.ticker), h("span", { class: "nm" }, x.name), h("span", { class: toneOf(x.move) }, pct(x.move))))));
      } else {
        el = h("div", { class: "nw-card nw-side", "aria-hidden": "true" }, h("span", { class: "nw-c-eye" }, "Coming up"),
          h("span", { class: "nw-rows" }, D.watch.slice(0, 4).map((w) => h("span", { class: "nw-row is-when" }, h("b", {}, when(w.when, w.date_only)), h("span", { class: "nm" }, w.what)))));
      }
      S.nodes.push({ el, a: L.sideAt(k), y: ROW_Y.story, kind: "side" });
    });
    S.stories.forEach((it, i) => {
      const el = h("button", { class: "nw-card", type: "button", "aria-label": `${it.n} of ${S.stories.length}, ${it.sec}: ${it.title}. ${meta(it)}`,
        onclick: () => (S.idx === i + 1 ? openStory(i) : goTo(i + 1)), onfocus: () => { if (S.idx !== i + 1) goTo(i + 1); } }, storyBody(it, true));
      S.nodes.push({ el, a: (i + 1) * L.stepM, y: ROW_Y.story, kind: "stop", stop: i + 1 });
    });
    /* the markets by importance from the middle outwards: the S&P 500 above the cover, the Nasdaq beside it */
    const slots = (D.board || []).map((_, k) => L.tileAt(k)).sort((x, y) => Math.abs(x) - Math.abs(y) || x - y);
    (D.board || []).forEach((t, i) => {
      const el = h("button", { class: `nw-mk${t.key === "spx" && D.map ? " has-map" : ""}`, type: "button", tabindex: "-1", "aria-hidden": "true", onclick: () => openMarket(i) }, tileBody(t));
      S.nodes.push({ el, a: slots[i], y: ROW_Y.tile, kind: "tile" });
    });
    (D.wire || []).slice(0, L.nW).forEach((w, i) => {
      const el = h("button", { class: "nw-card nw-wcard", type: "button", tabindex: "-1", "aria-hidden": "true", onclick: () => openWire(i) }, wireBody(w));
      S.nodes.push({ el, a: L.wireAt(i), y: ROW_Y.wire, kind: "wire" });
    });
    const row = { tile: 0, stop: 1, side: 1, wire: 2 };
    S.pre = !still();                                     // the cards wait in the depth until the entrance
    S.nodes.forEach((n) => {
      n.el.style.transform = place3(n.a, n.y, still() ? 0 : -1100);
      if (!still()) {
        n.el.style.opacity = "0";
        n.delay = Math.round(150 + Math.min(1.25, Math.abs(n.a)) * 520 + row[n.kind] * 110);
      }
    });
    S.ring = h("div", { class: "nw-ring" }, h("div", { class: "nw-wall" }, S.nodes.map((n) => n.el)));
    return S.ring;
  }
  /* the entrance, after the first paint: each card glides from the depth to its place; then the walk takes over */
  function enterRoom() {
    if (!S.pre) return;
    S.pre = false;
    S.nodes.forEach((n) => {
      const on = n.kind === "stop" && n.stop === S.idx, d = Math.abs(n.a - (S.yaw || 0));
      n.el.style.transition = `transform 1300ms cubic-bezier(.16, .84, .24, 1) ${n.delay}ms, opacity 900ms ease ${n.delay}ms`;
      n.el.style.transform = place3(n.a, n.y, on ? 90 : 0, on ? 1.06 : 1);
      n.el.style.opacity = d < 0.2 ? "1" : String(Math.max(0.28, 1 - (d - 0.2) * 0.65));
    });
    setTimeout(() => { S.nodes.forEach((n) => { n.el.style.transition = ""; }); S.dirty = true; wake(); }, 2900);
  }
  /* the walk: the camera turns to the story at f (fractions in between); every card further than 72° is hidden */
  function roomPlace() {
    const yaw = S.f * S.L.stepM;
    S.yaw = yaw;
    S.nodes.forEach((n) => {
      const d = Math.abs(n.a - yaw);
      const hide = d > 1.25;
      if (n.el.hidden !== hide) n.el.hidden = hide;
      if (!hide && !S.pre) n.el.style.opacity = d < 0.2 ? "1" : String(Math.max(0.28, 1 - (d - 0.2) * 0.65));
    });
    focusStop(Math.round(S.f));
  }
  function focusStop(i) {
    if (i === S.idx) return;
    const prev = S.idx;
    S.idx = i;
    S.nodes.filter((n) => n.kind === "stop" && (n.stop === i || n.stop === prev)).forEach((n) => {
      const on = n.stop === i;
      n.el.classList.toggle("is-on", on);
      if (!S.pre) n.el.style.transform = place3(n.a, n.y, on ? 90 : 0, on ? 1.06 : 1);
    });
    S.idxBtns.forEach((b, k) => b.setAttribute("aria-current", k === i - 1 ? "true" : "false"));
    const it = i > 0 ? S.stories[i - 1] : null, hud = S.hud;
    if (it) {
      hud.eye.textContent = `${pad(it.n)} / ${pad(S.stories.length)} · ${it.sec}`;
      hud.title.textContent = it.title;
      hud.meta.textContent = meta(it);
      hud.acts.hidden = false;
      hud.src.href = it.url;
      const r = REGION[it.region] || REGION.Global;
      if (r[0] != null) S.rotTarget = (r[0] * Math.PI) / 180;
      S.mark = r[1];
    } else {
      hud.eye.textContent = "Today";
      hud.title.textContent = "The day in markets";
      hud.meta.textContent = `${S.stories.length} stories from primary sources · scroll to walk the room`;
      hud.acts.hidden = true;
      S.mark = -1;
    }
  }

  /* ---------------------------------------------------------------- the tunnel */
  const PER_RING = 6, DZ = 640, DEPTH = 3.2;
  const RX = () => (compact() ? 150 : 560), RY = () => (compact() ? 280 : 300);
  function buildTunnel(D) {
    const seq = [];
    (D.board || []).forEach((t, i) => seq.push({ kind: "tile", i, sec: "Markets" }));
    S.stories.forEach((it, i) => seq.push({ kind: "story", i, sec: it.sec }));
    (D.wire || []).forEach((w, i) => seq.push({ kind: "wire", i, sec: "The wire" }));
    S.nodes = seq.map((x, k) => {
      const ring = Math.floor(k / PER_RING), j = k % PER_RING;
      const phi = j * (2 * Math.PI / PER_RING) + Math.PI / 6 + ring * 0.5;
      let el;
      if (x.kind === "tile") el = h("button", { class: "nw-mk", type: "button", onclick: () => openMarket(x.i) }, tileBody(D.board[x.i]));
      else if (x.kind === "story") el = h("button", { class: "nw-card nw-tcard", type: "button", onclick: () => openStory(x.i) }, storyBody(S.stories[x.i], true));
      else el = h("button", { class: "nw-card nw-wcard", type: "button", onclick: () => openWire(x.i) }, wireBody(D.wire[x.i]));
      el.tabIndex = -1;
      el.setAttribute("aria-hidden", "true");
      return Object.assign(x, { el, ring, z: -ring * DZ, phi });
    });
    S.rings = Math.max(1, Math.ceil(seq.length / PER_RING));
    S.nodes.forEach((n) => { n.el.style.transform = `translate3d(${(RX() * Math.sin(n.phi)).toFixed(1)}px, ${(-RY() * Math.cos(n.phi)).toFixed(1)}px, ${n.z}px)`; });
    S.ring = h("div", { class: "nw-tunnel" }, S.nodes.map((n) => n.el));
    return S.ring;
  }
  function tunnelPlace() {
    const cam = S.f * DZ;
    S.cam = cam;
    S.nodes.forEach((n) => {
      const z = n.z + cam;                                  // > 0: in front of the stage plane, towards the viewer
      const hide = z > 420 || z < -DEPTH * DZ;
      if (n.el.hidden !== hide) n.el.hidden = hide;
      if (!hide) n.el.style.opacity = String(Math.max(0, Math.min(1, z > 200 ? (420 - z) / 220 : 1 + z / (DEPTH * DZ) * 1.15)));
    });
    const ring = Math.max(0, Math.min(S.rings - 1, Math.round(S.f)));
    if (ring !== S.idx) {
      S.idx = ring;
      const here = S.nodes.filter((n) => n.ring === ring);
      const first = here[0];
      S.hud.eye.textContent = `${pad(ring + 1)} / ${pad(S.rings)} · ${[...new Set(here.map((n) => n.sec))].join(" · ")}`;
      S.hud.title.textContent = !first ? "" : first.kind === "story" ? S.stories[first.i].title : first.kind === "wire" ? S.D.wire[first.i].title : "The markets at the close";
      S.hud.meta.textContent = "Scroll to fly through the day";
      S.hud.acts.hidden = true;
      S.mark = -1;
    }
  }

  /* ---------------------------------------------------------------- 3D: the stage, the walk, the frame */
  function stage3d(D) {
    const canvas = h("canvas", { class: "nw-sky", "aria-hidden": "true" });
    const world = h("div", { class: `nw-world${S.mode === "tunnel" ? " is-tunnel" : ""}${compact() ? " is-compact" : ""}` }, S.mode === "tunnel" ? buildTunnel(D) : buildRoom(D));
    if (S.mode === "room") world.style.perspective = `${PERSP}px`;
    S.idxBtns = [];
    const hud = S.hud;
    hud.eye = h("p", { class: "nw-eye" });
    hud.title = h("p", { class: "nw-ttl" });
    hud.meta = h("p", { class: "nw-meta" });
    hud.src = h("a", { class: "nw-act", target: "_blank", rel: "noopener" }, "Source ", arrowOut(), newTab());
    hud.acts = h("div", { class: "nw-acts" }, h("button", { class: "nw-act is-main", type: "button", onclick: () => S.idx > 0 && openStory(S.idx - 1) },
      "Open ", h("span", { "aria-hidden": "true" }, "→")), hud.src);
    S.stage = h("div", { class: "nw-stage", role: "region", "aria-label": `Markets Briefing, ${S.mode} view` },
      canvas, world,
      h("div", { class: "nw-hud nw-hud-title" }, h("h1", { id: "nw-h1", tabindex: "-1" }, "Markets Briefing"), h("p", { class: "nw-edition" }, edition(D))),
      h("div", { class: "nw-hud nw-hud-focus" }, hud.eye, hud.title, hud.meta, hud.acts),
      h("div", { class: "nw-hud nw-hud-views" }, viewSwitch()),
      h("p", { class: "nw-hud nw-hud-legal" }, LEGAL, " · ", aboutBtn()));
    S.scroller = h("div", { class: "nw-scroll" }, S.stage);
    S.canvas = canvas;
    return h("div", { class: "nw-3d" }, S.scroller);
  }
  const stops = () => (S.mode === "tunnel" ? S.rings : S.L.stops);
  function measure() {
    if (!S.scroller) return;
    const bar = parseFloat(css("--site-bar-h")) || 56;
    S.step = Math.max(240, Math.min(480, Math.round(innerHeight * (S.mode === "tunnel" ? 0.55 : 0.46))));
    S.scroller.style.height = `${Math.round(innerHeight - bar + (stops() - 1) * S.step)}px`;
    S.top0 = S.scroller.getBoundingClientRect().top + scrollY - bar;
  }
  function fromScroll() {
    if (S.drag) return;
    S.target = Math.max(0, Math.min(stops() - 1, (scrollY - S.top0) / S.step));
    wake();
  }
  function goTo(i, instant) {
    if (S.mode !== "room" && S.mode !== "tunnel") return;
    i = Math.max(0, Math.min(stops() - 1, i));
    S.target = i;
    window.scrollTo({ top: S.top0 + i * S.step, behavior: instant || still() ? "auto" : "smooth" });
    wake();
  }
  function wake() { if (!S.raf && (S.mode === "room" || S.mode === "tunnel")) S.raf = requestAnimationFrame(frame); }
  function frame(t) {
    S.raf = 0;
    if (S.mode !== "room" && S.mode !== "tunnel") return;
    const d = S.target - S.f;
    const moving = Math.abs(d) > 0.0005;
    S.f = moving ? S.f + d * 0.12 : S.target;
    if (moving || S.dirty) { (S.mode === "room" ? roomPlace : tunnelPlace)(); S.dirty = false; }
    S.px += ((S.pt ? S.pt.x : 0) - S.px) * 0.05;
    S.py += ((S.pt ? S.pt.y : 0) - S.py) * 0.05;
    S.ring.style.transform = S.mode === "room"
      ? `translateZ(${PERSP}px) rotateX(${(-S.py * 0.05).toFixed(4)}rad) rotateY(${(S.yaw + S.px * 0.07).toFixed(4)}rad)`
      : `rotateX(${(-S.py * 0.06).toFixed(4)}rad) rotateY(${(S.px * 0.08).toFixed(4)}rad) translateZ(${S.cam || 0}px)`;
    S.rot += ((S.mark >= 0 ? S.rotTarget : S.rot + 0.02) - S.rot) * 0.04;
    if (S.sky && !document.hidden && t - S.last > 32) {
      S.sky.draw((t - S.t0) / 1000, S.mode === "room" ? S.yaw || 0 : S.f * 0.5, S.rot, S.mark, S.mode === "tunnel" ? S.f : 0);
      S.last = t;
    }
    if (moving || S.sky || Math.abs(S.px - (S.pt ? S.pt.x : 0)) > 0.001) S.raf = requestAnimationFrame(frame);
  }
  /* a drag turns the room (sideways) or flies the tunnel (up and down); the page's scroll follows on release */
  function onDown(e) {
    if (e.button !== 0 || (e.target.closest && e.target.closest("a, nav, .nw-hud"))) return;
    S.drag = { x: e.clientX, y: e.clientY, f: S.f, moved: false, id: e.pointerId };
  }
  function onMove(e) {
    if (e.pointerType === "mouse") { S.pt = { x: e.clientX / innerWidth - 0.5, y: e.clientY / innerHeight - 0.5 }; wake(); }
    if (!S.drag || e.pointerId !== S.drag.id) return;
    const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
    if (!S.drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!S.drag.moved) { S.drag.moved = true; S.stage.setPointerCapture(e.pointerId); S.stage.classList.add("is-dragging"); }
    S.target = Math.max(0, Math.min(stops() - 1, S.drag.f - (S.mode === "tunnel" ? -dy / 220 : dx / (compact() ? 170 : 300))));
    wake();
  }
  function onUp(e) {
    if (!S.drag || e.pointerId !== S.drag.id) return;
    const moved = S.drag.moved;
    S.drag = null;
    S.stage.classList.remove("is-dragging");
    if (moved) {
      goTo(Math.round(S.target), true);
      const stopClick = (ev) => { ev.stopPropagation(); ev.preventDefault(); };      // a drag that ends on a card does not open it
      S.stage.addEventListener("click", stopClick, { capture: true, once: true });
      setTimeout(() => S.stage && S.stage.removeEventListener("click", stopClick, { capture: true }), 0);
    }
  }

  /* ---------------------------------------------------------------- the sky: one fragment shader */
  const VERT = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";
  const FRAG = `precision mediump float;
uniform vec2 uRes; uniform float uTime; uniform float uYaw; uniform float uRot; uniform float uFly;
uniform vec3 uMk[6];
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
  vec2 sp = vec2(p.x + uYaw * 0.32, p.y + uFly * 0.03) * 95.0;
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
    float rays = 0.30 + 0.95 * pow(fbm(vec2(ax * 9.5 + fk * 13.0, uTime * 0.07)), 1.6);
    float body = smoothstep(-0.018, 0.012, d) * (exp(-max(d, 0.0) * (4.2 + 2.2 * fk)) + 0.9 * exp(-max(d, 0.0) * 38.0));
    a += body * rays * (0.70 - 0.17 * fk);
  }
  a *= 0.55 + 0.45 * smoothstep(0.15, 0.75, fbm(vec2(ax * 0.45, uTime * 0.01)));
  vec3 aur = mix(vec3(0.26, 0.62, 1.0), vec3(0.46, 0.42, 1.0), smoothstep(0.62, 0.98, uv.y));
  col += aur * a * 1.55 * smoothstep(hz, hz + 0.12, uv.y);
  if (uv.y < hz) {
    float fy = (hz - uv.y) / hz;
    vec3 fl = mix(vec3(0.035, 0.06, 0.13), vec3(0.012, 0.016, 0.035), fy);
    vec2 q = vec2(p.x / 1.15, (uv.y - hz * 0.42) * 2.4);
    fl += vec3(0.14, 0.34, 0.85) * exp(-dot(q, q) * 2.6) * 0.62;
    float gx = abs(fract((p.x + uYaw * 0.5) / (0.06 + fy * 0.5)) - 0.5);
    fl += vec3(0.25, 0.5, 1.0) * smoothstep(0.03, 0.0, gx) * (1.0 - fy) * 0.05;
    col = fl;
  }
  col += vec3(0.30, 0.55, 1.0) * exp(-abs(uv.y - hz) * 70.0) * 0.16;
  vec2 gc = vec2(0.0, hz * 0.55); float gr = 0.145;
  vec2 g = (p - gc) / gr; float r2 = dot(g, g);
  if (r2 < 1.0) {
    float z = sqrt(1.0 - r2);
    float t = -0.6;
    vec3 n1 = vec3(g.x, g.y * cos(t) - z * sin(t), g.y * sin(t) + z * cos(t));
    float cr = cos(uRot); float sr = sin(uRot);
    vec3 m = vec3(n1.x * cr + n1.z * sr, n1.y, -n1.x * sr + n1.z * cr);
    float lat = asin(clamp(m.y, -1.0, 1.0)); float lon = atan(m.x, m.z);
    vec2 gp = vec2(lon, lat) * (16.0 / 3.14159);
    float dotv = smoothstep(0.24 * cos(lat) + 0.02, 0.04, length(fract(gp) - 0.5));
    float rim = pow(1.0 - z, 2.2);
    vec3 gcol = vec3(0.02, 0.04, 0.10) + vec3(0.42, 0.70, 1.0) * dotv * (0.18 + 0.82 * z) * 0.85 + vec3(0.42, 0.70, 1.0) * rim * 0.75;
    for (int i = 0; i < 6; i++) {
      vec3 mk = uMk[i];
      vec3 dir = vec3(cos(mk.x) * sin(mk.y), sin(mk.x), cos(mk.x) * cos(mk.y));
      float c = dot(m, dir);
      float glow = exp(-(1.0 - c) * 900.0) * 1.6 + exp(-(1.0 - c) * 120.0) * 0.35;
      gcol += vec3(0.75, 0.88, 1.0) * glow * mk.z * smoothstep(0.0, 0.25, z);
    }
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
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const U = (n) => gl.getUniformLocation(prog, n);
      const u = { res: U("uRes"), time: U("uTime"), yaw: U("uYaw"), rot: U("uRot"), fly: U("uFly"), mk: U("uMk") };
      const mk = new Float32Array(18);
      return {
        draw(t, yaw, rot, mark, fly) {
          const k = 0.5 * Math.min(2, devicePixelRatio || 1);
          const w = Math.max(2, Math.round(canvas.clientWidth * k)), hh = Math.max(2, Math.round(canvas.clientHeight * k));
          if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; gl.viewport(0, 0, w, hh); }
          CENTRES.forEach((c, i) => {
            mk[i * 3] = (c[0] * Math.PI) / 180; mk[i * 3 + 1] = (c[1] * Math.PI) / 180; mk[i * 3 + 2] = mark >= 0 && c[2] === mark ? 1 : 0.35;
          });
          gl.uniform2f(u.res, w, hh); gl.uniform1f(u.time, t); gl.uniform1f(u.yaw, yaw); gl.uniform1f(u.rot, rot);
          gl.uniform1f(u.fly, fly || 0); gl.uniform3fv(u.mk, mk);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          if (!canvas.classList.contains("on")) canvas.classList.add("on");
        },
        drop() { const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); },
      };
    } catch (e) {
      console.warn("Markets Briefing: the 3D sky is off", e && e.message);
      return null;
    }
  }

  /* ---------------------------------------------------------------- dialogs: a story, a wire line, a market, the method */
  function dialog() {
    if (S.dlg && S.dlg.el.isConnected) return S.dlg;
    const d = { body: h("div", { class: "nw-dlg-in" }) };
    d.el = h("dialog", { class: "nw-dlg", "aria-labelledby": "nw-dlg-h", onclose: () => {
      if (/[?&]story=/.test(location.hash)) history.replaceState(history.state, "", `${location.pathname}${location.search}#/news`);
      if (d.back && d.back.isConnected) d.back.focus({ preventScroll: true });
    } }, d.body);
    d.el.addEventListener("click", (e) => { if (e.target === d.el) d.el.close(); });
    S.el.append(d.el);
    S.dlg = d;
    return d;
  }
  function show(nodes, focusSel) {
    const d = dialog();
    d.el.classList.remove("is-wide");
    if (!d.el.open) d.back = document.activeElement;
    d.body.replaceChildren(...nodes.flat().filter(Boolean));
    if (!d.el.open) d.el.showModal();
    const f = d.body.querySelector(focusSel || "a.nw-act, button.nw-x");
    if (f) f.focus();
    return d;
  }
  const xBtn = () => h("button", { class: "nw-x", type: "button", "aria-label": "Close", onclick: () => S.dlg && S.dlg.el.close() }, icon("close", 16));
  function openStory(i) {
    const n = S.stories.length;
    const it = S.stories[((i % n) + n) % n];
    if (!it) return;
    const step = (k) => { const j = (it.n - 1 + k + n) % n; if (S.mode === "room") goTo(j + 1); openStory(j); };
    show([h("div", { class: "nw-dlg-head" }, h("p", { class: "nw-eye" }, `${pad(it.n)} / ${pad(n)} · ${it.sec}`), xBtn()),
      h("h2", { id: "nw-dlg-h" }, it.title),
      h("ul", { class: "nw-facts" }, it.facts.map((f) => h("li", {}, f))),
      it.why ? h("p", { class: "nw-why" }, it.why) : null,
      h("p", { class: "nw-meta" }, meta(it)),
      h("div", { class: "nw-dlg-acts" }, h("a", { class: "nw-act is-main", href: it.url, target: "_blank", rel: "noopener" }, "Read the source ", arrowOut(), newTab()),
        it.spark && S.D.map && S.D.map.rows.some((r) => r.t === it.spark.ticker)
          ? h("button", { class: "nw-act", type: "button", onclick: () => openMap(it.spark.ticker) }, `${it.spark.ticker} on the map`) : null,
        h("span", { class: "sp" }),
        n > 1 ? h("button", { class: "nw-act", type: "button", onclick: () => step(-1) }, "‹ Previous") : null,
        n > 1 ? h("button", { class: "nw-act", type: "button", onclick: () => step(1) }, "Next ›") : null)]);
    history.replaceState(history.state, "", `${location.pathname}${location.search}#/news?story=${it.id}`);
  }
  function openWire(i) {
    const w = (S.D.wire || [])[i];
    if (!w) return;
    const who = w.title.split(":")[0];
    show([h("div", { class: "nw-dlg-head" }, h("p", { class: "nw-eye" }, `The wire · ${wireTag(w)}`), xBtn()),
      h("h2", { id: "nw-dlg-h" }, w.title),
      h("p", { class: "nw-why" }, w.kind === "filing"
        ? `A current report (Form 8-K) that ${who} filed with the Securities and Exchange Commission${w.release ? ", with a press release attached" : ""}. The words after the colon name the report's items; the filing has the text.`
        : `A release by the ${w.source}, with its own title; the source has the text.`),
      h("p", { class: "nw-meta" }, `${w.source} · ${when(w.time, w.date_only)}`),
      h("div", { class: "nw-dlg-acts" }, h("a", { class: "nw-act is-main", href: w.url, target: "_blank", rel: "noopener" }, "Open the source ", arrowOut(), newTab()))]);
  }
  function openMap(focus) {
    const mp = S.D.map;
    if (!mp) return;
    const d = show([h("div", { class: "nw-dlg-head" }, h("p", { class: "nw-eye" }, `The S&P 500 map · ${dayOf(mp.as_of)}`), xBtn()),
      h("h2", { id: "nw-dlg-h" }, focus ? `${(mp.rows.find((r) => r.t === focus) || {}).n || focus} on the map` : `The ${mp.n} largest companies, by sector`),
      mapView(mp, focus, "nw-map-dlg"), legend(),
      h("p", { class: "nw-meta" }, `Each box is a company sized by its market value; its colour is its move on ${dayOf(mp.as_of)}. ${mp.source}.`)], "button.nw-x");
    d.el.classList.add("is-wide");
  }
  const money = (bn) => (bn >= 1000 ? `$${(bn / 1000).toFixed(2)} trillion` : `$${Math.round(bn)} billion`);
  function openCompany(t) {
    const mp = S.D.map;
    const r = mp && mp.rows.find((x) => x.t === t);
    if (!r) return;
    const p = (mp.profiles || {})[t] || {};
    const today = [...S.stories.filter((it) => (it.tickers || []).includes(t) || (it.spark && it.spark.ticker === t)).map((it) => ({ title: it.title, go: () => openStory(it.n - 1) })),
      ...(S.D.wire || []).filter((w) => w.ticker === t).map((w) => ({ title: w.title, url: w.url }))];
    const row = (k, v) => (v ? h("div", { class: "nw-kv" }, h("dt", {}, k), h("dd", {}, v)) : null);
    const figures = [p.pe ? `price-to-earnings ratio ${p.pe.toFixed(1)}` : null, ok(p.rg) ? `revenue growth ${sign(p.rg, fmt.p1)}` : null,
      ok(p.nm) ? `net margin ${fmt.p1.format(p.nm)}` : null].filter(Boolean).join(" · ");
    show([h("div", { class: "nw-dlg-head" }, h("p", { class: "nw-eye" }, `${t}${(p.x || []).length ? ` · ${p.x.join(", ")}` : ""}`), xBtn()),
      h("div", { class: "nw-co-head" }, mark(t, "is-big"), h("h2", { id: "nw-dlg-h" }, r.n, " ", h("span", { class: toneOf(r.m) }, pct(r.m)))),
      h("dl", { class: "nw-kvs" },
        row("Listed on", (p.x || []).length ? `${p.x.join(" and ")}, United States` : null),
        row("Ticker and ISIN", `${t}${p.isin ? ` · ${p.isin}` : ""}`),
        row("Also traded", "in euros on Lang & Schwarz, Germany (this page's price source)"),
        row("Sector", [r.s, p.sub].filter(Boolean).join(" · ")),
        row("Headquarters", p.hq ? `${p.hq}${p.inc ? ` · incorporated in ${p.inc}` : ""}` : null),
        row("Market value", `${money(r.c)} · ${dayOf(mp.as_of)} move ${pct(r.m)}`),
        row("From its filings", figures ? `${figures} (last twelve months${p.period ? ` to ${day(p.period)}` : ""})` : null),
        row("Fiscal year ends", p.fy)),
      today.length ? h("div", { class: "nw-today" }, h("p", { class: "nw-eye" }, "In today's briefing"),
        h("ul", {}, today.slice(0, 4).map((x) => h("li", {}, x.go ? h("button", { class: "nw-link", type: "button", onclick: x.go }, x.title)
          : h("a", { href: x.url, target: "_blank", rel: "noopener" }, x.title, newTab()))))) : null,
      h("div", { class: "nw-dlg-acts" },
        p.cik ? h("a", { class: "nw-act is-main", href: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${p.cik}&type=&dateb=&owner=include&count=40`,
          target: "_blank", rel: "noopener" }, "SEC filings ", arrowOut(), newTab()) : null,
        h("span", { class: "sp" }),
        h("button", { class: "nw-act", type: "button", onclick: () => openMap(t) }, "‹ Back to the map")),
      h("p", { class: "nw-meta" }, "Listing, headquarters and fiscal year: the company's SEC submissions. Figures: its own filings, as reported. Sector: the S&P 500 list. Prices: Lang & Schwarz.")], "a.nw-act, button.nw-x");
  }
  function openTile(i) {
    const t = (S.D.board || [])[i];
    if (!t) return;
    const f = tileFigures(t);
    show([h("div", { class: "nw-dlg-head" }, h("p", { class: "nw-eye" }, "Markets"), xBtn()),
      h("h2", { id: "nw-dlg-h" }, t.label, " ", h("span", { class: f.tone }, f.chg)),
      h("p", { class: "nw-why" }, `${t.what}. ${f.level ? `${f.level} on ` : "Change on "}${dayOf(t.as_of)}, against the observation before.`),
      h("p", { class: "nw-meta" }, t.source === "FRED" ? "Federal Reserve Bank of St. Louis, FRED" : "Lang & Schwarz indicative prices, for personal use")], "button.nw-x");
  }
  function openAbout() {
    show([h("div", { class: "nw-dlg-head" }, h("p", { class: "nw-eye" }, "Markets Briefing"), xBtn()),
      h("h2", { id: "nw-dlg-h" }, "Sources and method"),
      h("p", { class: "nw-why" }, "Every morning two Claude desks, one for markets and companies and one for macro and policy, read candidates from primary sources: the Federal Reserve, the European Central Bank and the Bank of England, the current reports (8-K) that S&P 500 companies file with the SEC, and web searches for official statistics and for government and company releases. They write each story in their own words, with its source, time and link. Fixed rules then drop any story without an https link, from an aggregator or a blog, outside the time window, with a quotation, or with a summary its stories do not support. A news outlet is cited only when no primary page states the facts; GDELT headlines only help to find stories and are never cited."),
      h("p", { class: "nw-why" }, "The wire lists every central bank release and S&P 500 current report of the window, unedited. Markets: funds and commodities quoted by Lang & Schwarz, in dollars or euros as marked, and the US 10-year yield and Brent from FRED."),
      h("p", { class: "nw-meta" }, `${LEGAL}. Not affiliated with Anthropic, the sources or the companies named; check the source before relying on any figure.`)], "button.nw-x");
  }

  /* ---------------------------------------------------------------- the page */
  function onKey(e) {
    if ((S.mode !== "room" && S.mode !== "tunnel") || (S.dlg && S.dlg.el.open) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowDown") { e.preventDefault(); goTo(S.idx + 1); }
    else if (k === "ArrowLeft" || k === "ArrowUp") { e.preventDefault(); goTo(S.idx - 1); }
    else if (k === "Enter" && S.mode === "room" && S.idx > 0 && !(e.target.closest && e.target.closest("a, button"))) { e.preventDefault(); openStory(S.idx - 1); }
  }
  function start3d() {
    measure();
    fromScroll();
    S.f = S.target;
    S.dirty = true;
    S.idx = -1;
    listen(window, "scroll", fromScroll, { passive: true });
    listen(window, "keydown", onKey);
    listen(S.stage, "scroll", () => { S.stage.scrollTop = 0; S.stage.scrollLeft = 0; });
    listen(S.stage, "pointerdown", onDown);
    listen(S.stage, "pointermove", onMove);
    listen(S.stage, "pointerup", onUp);
    listen(S.stage, "pointercancel", onUp);
    listen(document, "visibilitychange", () => { if (!document.hidden) wake(); });
    wake();
    listen(S.stage, "pointerleave", () => { S.pt = null; });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (S.mode !== "room" && S.mode !== "tunnel") return;
      if (S.mode === "room") enterRoom();
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
    S.drag = null;
    S.pre = false;
    S.pt = null;
  }
  function draw(picked) {
    stop();
    const D = S.D;
    if (!D || D.state !== "live" || !S.stories.length) {
      S.el.replaceChildren(h("div", { class: "nw-flat" }, h("div", { class: "nw-empty" }, h("h1", { id: "nw-h1" }, "Markets Briefing"),
        h("p", { class: "nw-edition" }, "The first edition is on its way: a new one every morning."), h("p", { class: "nw-meta" }, LEGAL))));
      return;
    }
    S.mode = view();
    if (S.mode === "list") {
      S.el.replaceChildren(listView(D));
      const card = picked && document.getElementById(`nw-${picked}`);
      if (card) setTimeout(() => card.scrollIntoView({ block: "center", behavior: still() ? "auto" : "smooth" }), 60);
    } else {
      S.el.replaceChildren(stage3d(D));
      start3d();
      const j = picked ? S.stories.findIndex((x) => x.id === picked) : -1;
      if (j >= 0) { if (S.mode === "room") goTo(j + 1, true); setTimeout(() => openStory(j), 60); }
    }
    let was = view(), t = null;
    listen(window, "resize", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (view() !== was) { was = view(); draw(); return; }
        if (S.mode === "room" || S.mode === "tunnel") { measure(); fromScroll(); S.dirty = true; wake(); }
      }, 150);
    });
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => { if (view() !== was) { was = view(); draw(); } };
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
        h("h1", { id: "nw-h1" }, "Markets Briefing"), h("p", { class: "nw-edition" }, "Loading the latest edition…")))));
      let D = null;
      const [dg, lg] = await Promise.allSettled([api("/api/news/digest"), fetch("logos/index.json").then((r) => (r.ok ? r.json() : []))]);
      D = dg.status === "fulfilled" ? dg.value : null;
      LOGOS = new Set(lg.status === "fulfilled" && Array.isArray(lg.value) ? lg.value : []);
      if (!el.isConnected || Router.current !== "news") return;
      S.D = D;
      S.stories = D ? flatten(D) : [];
      document.title = "Markets Briefing · SV Terminal";
      draw(params && params.get("story"));
    },
    update(params) {
      const id = params && params.get("story");
      const j = id ? S.stories.findIndex((x) => x.id === id) : -1;
      if (j >= 0) { if (S.mode === "room") goTo(j + 1); openStory(j); }
      return true;
    },
    leave() {
      stop();
      S.el = null;
      S.ring = null;
      S.nodes = [];
      S.idxBtns = [];
    },
  };
})();
