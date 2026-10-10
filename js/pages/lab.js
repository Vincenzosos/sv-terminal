"use strict";
/* Trading Lab · PAPER MONEY ONLY (LAB_SPEC §13).
   Pages.lab is the Trading Lab tab (#/lab): one page that says what the main book holds, what it paid, what it is worth
   now, what it will do next, how it compares with the Europe ETF and the S&P 500 ETF, and how the other strategies are
   doing. This file also holds the shared helpers (LabUI) and the page-level states (not started, setting up, rules
   changed, behind, demo). The detail views live in lab_details.js (scorecard, journal), lab_analysis.js (league,
   model, robustness) and lab_ops.js (costs, data, method); "How it works" (about.js) draws them on demand.
   Every number comes from /api/lab/* (the engine's prepared files); the pages add arithmetic and words, never advice.
   The lab places no orders and has no link to Trade Republic. */

window.LabViews = window.LabViews || {};

const LabUI = (() => {
  const U = { charts: [], observers: [], timers: [], live: new Map() };

  /* ---------------------------------------------------------------- numbers, dates, words */
  const nf = (dp) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  U.NF = [fmt.n0, fmt.n1, fmt.n2, nf(3), nf(4)];
  U.PF = [fmt.p0, fmt.p1, fmt.p2];
  const ok = (x) => x != null && Number.isFinite(x);
  U.ok = ok;
  U.na = (why) => h("span", { class: "lab-na", "data-tip": why || "not available", tabindex: "0" }, "n/a");
  U.num = (x, dp = 2) => (ok(x) ? unsigned(x, U.NF[dp]) : "—");
  U.snum = (x, dp = 2) => (ok(x) ? signed(x, U.NF[dp]) : "—");                     // toned, signed
  U.int = (x) => (ok(x) ? unsigned(x, fmt.n0) : "—");
  U.eur = (x, dp = 2) => (ok(x) ? unsigned(x, dp ? fmt.eur : fmt.eur0) : "—");
  U.seur = (x, dp = 2) => (ok(x) ? signed(x, dp ? fmt.eur : fmt.eur0) : "—");
  U.pct = (x, dp = 1) => (ok(x) ? unsigned(x, U.PF[dp]) : "—");
  U.spct = (x, dp = 2, arrow = false) => (ok(x) ? signed(x, U.PF[dp], arrow) : "—");
  U.bps = (x, dp = 1) => (ok(x) ? `${unsigned(x, U.NF[dp])} bps` : "—");
  U.sbps = (x, dp = 1) => (ok(x) ? h("span", { class: tone(x) }, `${sign(x, U.NF[dp])} bps`) : "—");
  U.px = (x) => (ok(x) ? unsigned(x, Math.abs(x) < 10 ? U.NF[3] : U.NF[2]) : "—");   // a share price in €
  U.d = (s) => (s ? day(s) : "—");
  U.ds = (s) => (s ? dayShort(s) : "—");
  U.hm = (iso) => (iso && iso.length >= 16 ? iso.slice(11, 16) : "—");                  // Berlin wall clock as sent
  U.when = (iso) => (iso ? `${dayShort(iso)} ${U.hm(iso)}` : "—");
  U.sha8 = (s) => (s ? `#${String(s).slice(0, 8)}` : "—");
  U.plural = (n, one, many) => `${U.int(n)} ${n === 1 ? one : many || `${one}s`}`;
  U.cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  /* a label that explains itself: one plain sentence on hover or focus (dotted underline) */
  U.tl = (text, tip) => h("span", { class: "lab-tip", "data-tip": tip, tabindex: "0" }, text);
  /* Greek letters inside upper-case labels (CSS uppercase would turn μ into M and λ into Λ) */
  U.gk = (ch) => h("span", { class: "greek" }, ch);
  U.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  /* statuses are words (with a glyph from the badge CSS), never colour alone */
  U.status = (s) => { const m = { met: ["Met", "ok"], fails: ["Fails", "bad"], too_early: ["Too early", "na"] }[s] || [s || "n/a", "na"]; return badge(m[0], m[1]); };
  U.KIND = { eligible: ["Eligible", ""], main: ["Main book", "paper"], reference: ["Reference", "ref"], diagnostic: ["Diagnostic", "shadow"], probe: ["Probe", "shadow"] };
  U.kind = (k, champion) => (champion ? badge("Champion", "you") : badge(...(U.KIND[k] || [k || "—", ""])));
  U.mode = (m) => ({ live: badge("Live", "live"), catchup: badge("Catch-up", "warn"), history: badge("History", "ref"), prelive: badge("Before live start", "na") }[m] || badge(m || "—", "na"));
  /* registered wording keeps its reading-list references ("[d13]"): each becomes a link to the reading list, the text unchanged */
  U.cite = (text, evidence) => {
    const ev = Object.fromEntries((evidence || []).map((x) => [x.id, x]));
    return String(text || "").split(/(\[[a-z]\d+\])/).map((part) => {
      const m = /^\[([a-z]\d+)\]$/.exec(part);
      if (!m) return prose(part);
      const x = ev[m[1]];
      return h("a", { href: "#/about?open=method", class: "lab-cite", "data-tip": x ? `${m[1]}: ${x.title}` : `reading list entry ${m[1]}` }, part);
    });
  };
  U.ftt = (g) => h("span", { class: `lab-ftt${g && g !== "FREE" ? " tax" : ""}`, "data-tip": g === "FREE" ? "No transaction tax on this name" : g ? `Transaction tax on paper purchases (${g})` : "" }, g || "—");
  U.check = (pass, text, muted) => h("span", { class: `lab-ck ${pass == null ? "na" : pass ? "ok" : "bad"}${muted ? " muted" : ""}` },
    h("b", { "aria-hidden": "true" }, pass == null ? "…" : pass ? "✓" : "✕"), h("span", { class: "sr-only" }, pass == null ? "not known: " : pass ? "passes: " : "does not pass: "), text);

  /* ---------------------------------------------------------------- data */
  U.get = (path, ms = 30_000) => cached(`lab:${path}`, () => api(path), ms);
  U.fresh = (path) => { invalidate(`lab:${path}`); return U.get(path); };
  U.dropCache = () => Object.keys(memo).filter((k) => k.startsWith("lab:")).forEach((k) => delete memo[k]);

  /* ---------------------------------------------------------------- page frame
     One Trading Lab page (#/lab). The detail views (league, scorecard, method, journal, costs, model, robustness, data)
     are drawn inside "How it works" when a reader opens their Details section (about.js). */
  /* season 2: the clock of each family, the t hurdle printed without rounding up (3.205, never 3.21) */
  U.FAM = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
  U.famWord = (f) => U.FAM[f] || (f ? U.cap(f) : "—");
  U.clockText = (f, nd) => (f === "weekly" ? `weekly decision on ${U.d((nd || {}).weekly_decision)}` : f === "monthly" ? `monthly decision on ${U.d((nd || {}).monthly_decision)}` : f === "daily" ? "decides after every session end" : "—");
  U.t3 = (x) => (ok(x) ? (Math.floor(x * 1000) / 1000).toFixed(3) : "—");
  U.BASIS = { pre: ["Before tax", "ref"], after: ["After tax", "paper"], both: ["Both lines", "warn"] };
  U.basis = (b) => (b ? badge(...(U.BASIS[b] || [b, "na"])) : null);
  /* the page head: the title and "paper money only" (no lede, no banner: the one-line disclaimer is in the footer or, on the
     public site, the band above every page) */
  U.pub = !!window.BussolaStatic;
  /* who runs the lab, in a sentence: the app on the owner's Mac (the public site cannot run anything) */
  U.runs = (verb = "is open") => (U.pub ? `the owner's computer ${verb === "is open" ? "runs" : verb}` : `SV Terminal ${verb}`);
  U.head = (sub, ...actions) => [pageHead(["Trading Lab", "paper money only"], null, ...actions)];
  /* plain-English names for the books (the registered ids and names are hashed and never change: only their display) */
  U.NAME = {
    MAIN: "Main book", "MAIN-X": "Main book, filled by hand (shadow)", "MAIN-HIST": "Main book, history run", CASH: "Cash",
    R1: "5-day reversal, 1 name", R2: "5-day reversal, 2 names", R3: "5-day reversal, 2 names, stressed markets only", R4: "5-day reversal, 2 names, kept while in the top 10",
    L1: "Regression forecast, 60-session memory", L2: "Regression forecast, 250-session memory", L3: "Regression forecast, 1,000-session memory",
    L4: "Calibration-table forecast", L5: "Signal-ensemble forecast", L6: "Regression (250), kept while positive", L7: "Regression (250), all names, kept while positive",
    L8: "Regression (250), two fixed slots", M1: "Meta-learner forecast", M2: "Meta-learner, kept while positive", M3: "Meta-learner, twice the cost bar",
    W1: "Weekly 5-day reversal, 2 names", W2: "Weekly reversal against its sector, 2 names", W3: "Weekly regression forecast", W4: "Weekly regression, all names, kept while positive",
    H1: "12-month momentum, top 5", H2: "Near the 52-week high, top 5", H3: "200-day trend, top 5", H4: "12-month momentum, top 5, market filter", H5: "Three slow signals combined, top 5",
    X1: "Europe ETF held", X2: "Equal-weight market line", X3: "Cash", X4: "Random picks, 2 names (daily)", X5: "Textbook 5-day reversal, all names",
    X6: "Random picks, 5 names (monthly)", X7: "Random picks, 2 names (weekly)",
    DX1: "Same-session reversal (diagnostic)", DX2: "Same-session regression (diagnostic)",
    P1: "22:38 reversal (probe)", P2: "22:38 regression (probe)", P3: "Morning gap, same day (probe)", P4: "Yesterday's losers, same day (probe)", P5: "Late-day rise, Europe ETF (probe)",
  };
  U.nm = (id, fallback) => U.NAME[id] || fallback || id || "—";
  /* each strategy in one plain sentence (from the registered league definitions, lab_protocol); the id is what the API
     sends, so a new season's main strategy is described without any page change */
  U.DESC = {
    R1: "Each session holds the 1 share, of the 55 with no transaction tax, that fell most against the market over the last 5 sessions.",
    R2: "Each session holds the 2 shares, of the 55 with no transaction tax, that fell most against the market over the last 5 sessions.",
    R3: "Like R2, but it trades only when markets are stressed; on calm sessions it holds cash.",
    R4: "Like R2, but it keeps a share while it stays in the top 10, for up to 10 sessions.",
    L1: "A statistical model learned from the last 60 sessions forecasts each share's next return; it buys 1 to 3 shares whose forecast beats the trading costs.",
    L2: "A statistical model learned from the last 250 sessions forecasts each share's next return; it buys 1 to 3 shares whose forecast beats the trading costs.",
    L3: "A statistical model learned from the last 1,000 sessions forecasts each share's next return; it buys 1 to 3 shares whose forecast beats the trading costs.",
    L4: "A calibration table turns past signals into a forecast; it buys 1 to 3 shares whose forecast beats the trading costs.",
    L5: "An average of several signal forecasts; it buys 1 to 3 shares whose forecast beats the trading costs.",
    L6: "The 250-session model; it holds up to 2 shares and keeps each while its forecast stays positive, for up to 10 sessions.",
    L7: "Like L6, but it chooses from all 108 shares (a share with a transaction tax must forecast enough to pay it).",
    L8: "The 250-session model with two fixed slots, each half of the book.",
    M1: "A model that combines the other models' forecasts; it buys 1 to 3 shares whose forecast beats the trading costs.",
    M2: "The combined model; it keeps each share while its forecast stays positive, for up to 10 sessions.",
    M3: "The combined model, buying only when the forecast is at least twice the trading costs.",
    W1: "After the last session of each week, holds the 2 shares (of the 55 with no transaction tax) that fell most against the market over 5 sessions.",
    W2: "After the last session of each week, holds the 2 shares that fell most against their own sector over 5 sessions.",
    W3: "After the last session of each week, a model learned from the last 250 sessions forecasts next week's return; it buys 1 to 3 shares whose forecast beats the costs.",
    W4: "After the last session of each week, a statistical model learned from the last 250 sessions forecasts each of the 108 shares' return for the next week; it buys up to 2 whose forecast beats the trading costs and keeps each while its forecast stays positive, for up to 4 weeks.",
    H1: "Once a month, holds the 5 shares that rose most over the past year (leaving out the last month); keeps a share while it ranks 15th or better.",
    H2: "Once a month, holds the 5 shares closest to their 52-week high; keeps a share while it ranks 15th or better.",
    H3: "Holds the 5 shares with the strongest 200-day trend; decides once a month and keeps a share while it ranks 15th or better.",
    H4: "Like H1, but it holds cash while the market as a whole is below its 200-day average.",
    H5: "Once a month, holds the 5 shares with the best average of three slow signals: the past year's rise, nearness to the 52-week high and the 200-day trend.",
    X1: "Buys the Europe ETF (SMEA) at the start and holds it: the benchmark.",
    X2: "The average return of all the shares the lab can trade, without any cost: a reference line that cannot be traded.",
    X3: "Holds cash, which earns 0%.",
    X4: "Holds 2 shares picked at random every session: what luck alone does at daily costs.",
    X5: "The textbook 5-day reversal rule on all 108 shares, picked again every session.",
    X6: "Holds 5 shares picked at random once a month: what luck alone does at monthly costs.",
    X7: "Holds 2 shares picked at random once a week: what luck alone does at weekly costs.",
    MAIN: "The main book: it follows the strategy set for the season, with its own €10,000.",
    CASH: "Holds cash, which earns 0%.",
  };
  U.desc = (id) => U.DESC[id] || null;
  /* a sector in one word (data/universe.json lists the ICB supersector) */
  U.SECTOR = { "Industrial Goods and Services": "Industrials", Banks: "Banks", Healthcare: "Healthcare", Utilities: "Utilities", Technology: "Tech",
    "Consumer Products and Services": "Consumer", Insurance: "Insurance", "Automobiles and Parts": "Autos", Energy: "Energy", Chemicals: "Chemicals",
    "Construction and Materials": "Construction", "Financial Services": "Finance", Telecommunications: "Telecom", "Food, Beverage and Tobacco": "Food",
    "Personal Care, Drug and Grocery Stores": "Staples", Retail: "Retail", "Travel and Leisure": "Travel", "Real Estate": "Property" };
  U.sector = (s) => (s ? U.SECTOR[s] || s.split(/[ ,]/)[0] : "—");
  /* "200-day trend, top 5" with the registered id beside it in mono ("H3 · TREND200-ALL-5" on hover) */
  U.book = (id, name) => h("span", { class: "lab-book", "data-tip": name ? `${id} · ${name}` : null }, h("span", { class: "nm" }, U.nm(id, name)), " ", h("span", { class: "lab-bid" }, id));
  U.POLICY = { RULE_D1: "re-picks its names every session", RULE_BAND: "keeps a name while it stays in the rule's top 10, up to 10 sessions",
    D1B: "enters when the forecast beats the round-trip cost; sells what is not picked again", D1F: "a fixed number of names, each forecast above its cost",
    BANDL: "keeps a name while its forecast stays above zero, up to 10 sessions", RULE_W: "re-picks its names after the last session of each week",
    D1B_W: "weekly: enters when the 5-session forecast beats the cost", BANDL_W: "weekly: keeps a name while its forecast stays above zero, up to 4 weeks",
    BAND_M: "monthly: keeps a share while it ranks 15th or better; no exit date",
    BAND_M_POS: "monthly: keeps a share while it ranks 15th or better and stays above its 200-day average; no exit date",
    HOLD: "buys once and holds", INDEX: "a costless reference line", CASH: "holds cash" };
  U.policy = (p) => (p ? h("span", { "data-tip": `Policy ${p}` }, U.POLICY[p] || p) : "—");
  /* NEXT EVENTS (lab_api.next_events): Berlin times from the calendar, worded against the day of the viewer, so a
     published snapshot stays true ("Tonight" on the day, "Mon 28 Sep" before it) until the next step replaces it */
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  U.wday = (s) => `${WD[new Date(`${s.slice(0, 10)}T12:00:00Z`).getUTCDay()]} ${dayShort(s)}`;
  const berlinDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  U.relWhen = (at, from = false) => {
    if (!at) return "—";
    const d = at.slice(0, 10), hm = at.slice(11, 16), eve = +at.slice(11, 13) >= 18, now = Date.now();
    const word = d === berlinDay(now) ? (eve ? "Tonight" : "Today") : d === berlinDay(now + 864e5) ? (eve ? "Tomorrow night" : "Tomorrow") : U.wday(d);
    return `${from ? `From ${word.replace(/^(Tonight|Today|Tomorrow)/, (w) => w.toLowerCase())}` : word} ≈${hm}`;
  };
  /* the same inside a sentence: "first decision tonight ≈23:13", "… Mon 28 Sep ≈23:00" */
  U.relIn = (at) => U.relWhen(at).replace(/^(Tonight|Today|Tomorrow)/, (w) => w.toLowerCase());
  U.EVT = { decide: "Decision", fill: "Paper fills", results: "Results", weekly: "Weekly", monthly: "Long hold" };
  U.nextStrip = (ne, opts = {}) => {
    const evs = ((ne || {}).events || []).slice(0, opts.max || 5);
    if (!evs.length) return null;
    const now = Date.now();
    return h("section", { class: "lab-strip lab-next", role: "status", "aria-label": "Next events" },
      h("div", { class: "lab-next-h", title: ne.note || null }, badge("Next events", "paper")),
      h("ol", { class: "lab-ev" }, evs.map((e, i) => {
        const due = Date.parse(e.at) < now;
        return h("li", { class: `ev ev-${e.kind}${i === 0 ? " first" : ""}`, title: U.cap(e.text) },
          h("span", { class: "k" }, U.EVT[e.kind] || e.kind),
          h("b", { class: "when" }, U.relWhen(e.at, e.kind === "results"), due ? h("span", { class: "due" }, " · due") : null));
      })));
  };
  /* the strips above the KPI strip: demo data, behind, stale prices */
  U.strips = (sum, job, sub) => {
    const out = [];
    if (!sum) return out;
    if (sum.demo) out.push(h("div", { class: "lab-strip demo", role: "note" }, badge("Demo", "mock"), h("span", {}, "Synthetic data")));
    const data = sum.data || {};
    const run = job && job.running;
    if (run && /CATCH/i.test(run.kind || "") && ok(run.total)) {
      out.push(h("div", { class: "lab-strip warn", role: "status" }, badge("Behind", "warn"), h("span", {}, `Catching up: ${U.int(run.done || 0)} of ${U.int(run.total)} sessions`)));
    } else if (sum.state === "behind" || data.behind > 0) {
      const n = data.behind > 0 ? `Behind by ${U.plural(data.behind, "session")}` : "Behind";
      out.push(h("div", { class: "lab-strip warn", role: "status" }, badge("Behind", "warn"),
        h("span", { title: "Waiting for prices. The panels show the last committed session." }, `${n} · last session ${U.d(sum.as_of_session)}`)));
    }
    if (data.stale_since) out.push(h("div", { class: "lab-strip warn", role: "status" }, badge("Stale", "warn"), h("span", {}, `Prices stale since ${U.d(data.stale_since)}`)));
    const ne = sum.next_events;
    /* before the first live session: the Desk lists what happens and when; the other pages say it in one line */
    const firstDecide = ne && ne.first_live ? (ne.events || []).find((e) => e.kind === "decide") : null;
    if (ne && ne.first_live && sub && sub !== "desk") out.push(h("div", { class: "lab-strip", role: "note" }, badge("Starting", "paper"),
      h("span", {}, `First live session ${firstDecide ? U.relIn(firstDecide.at) : U.d(sum.live_start)} · `, link("Trading Lab", "#/lab"))));
    else if (ne && ne.first_live) out.push(U.nextStrip(ne));
    else if (sum.state === "history_only") out.push(h("div", { class: "lab-strip", role: "note" }, badge("History only", "na"),
      h("span", {}, `No live session yet · starts ${U.d(sum.live_start)}`)));
    /* one row of notices: the state strips and the page's own caveat (U.caveat) sit side by side, not stacked */
    return out.length ? [h("div", { class: "lab-strips" }, out)] : [];
  };
  /* a page caveat ("Read first", "Proxy"…) joins the row of state strips under the page head, or starts one */
  U.caveat = (el, node) => {
    const row = el.querySelector(":scope > .lab-strips");
    if (row) row.append(node); else el.append(h("div", { class: "lab-strips" }, node));
  };
  /* the KPI strip: exactly six cells, the first is the hero; demo data wears a DEMO badge on the strip */
  U.kpis = (sum, cells) => {
    if (sum && sum.demo && cells[0]) cells[0] = { ...cells[0], label: [cells[0].label, badge("Demo", "mock")] };
    return kpiStrip(cells);
  };
  U.loading = () => h("div", { class: "lab-loading" }, skeleton(96), h("div", { class: "grid" }, h("div", { class: "span-8" }, skeleton(260)), h("div", { class: "span-4" }, skeleton(260))));
  U.grid = (...cards) => h("div", { class: "grid" }, cards);
  U.pad = (...kids) => h("div", { class: "lab-pad" }, kids);
  /* replaceChildren without the "null" text a missing optional part would leave */
  U.fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false));
  U.note = (...kids) => h("p", { class: "note" }, kids);
  U.errorCard = (msg) => U.grid(card({ title: "This part could not load", span: 12, body: empty(msg) }));
  U.foot = (...parts) => parts.flat().filter(Boolean).map((p, i) => (i ? [" · ", p] : p));
  U.src = (sum, extra) => statusSource(`Trading Lab${sum && sum.season ? ` ${sum.season}` : ""}${sum && sum.as_of_session ? ` · ${dayShort(sum.as_of_session)}` : ""}${extra ? ` · ${extra}` : ""}`);

  /* a long list shows its first 5 on a phone (then "Show all"), its usual first n on a wider screen */
  U.phoneN = (n) => (window.innerWidth < 760 ? Math.min(5, n) : n);
  /* "Show all": the first n, then a button (panels never scroll inside) */
  U.showAll = (items, n, draw, noun = "rows") => {
    const box = h("div", { class: "lab-more" });
    if (items.length <= n) { box.append(draw(items)); return [box]; }
    let all = false;
    const btn = h("button", { class: "btn sm ghost", type: "button" });
    const paint = () => { box.replaceChildren(draw(all ? items : items.slice(0, n))); btn.textContent = all ? `Show the first ${n}` : `Show all ${items.length} ${noun}`; };
    btn.addEventListener("click", () => { all = !all; paint(); });
    paint();
    return [box, h("div", { class: "lab-more-b" }, btn)];
  };

  /* ---------------------------------------------------------------- charts (Lightweight Charts, tokens only) */
  U.lwc = (el, opts) => { const c = makeChart(el, opts); if (c) U.charts.push(c); return c; };
  U.KEY = { you: ["var(--s1)", "line"], youdash: ["var(--s1)", "dash"], area: ["var(--s1)", "area"], pick: ["var(--s2)", "line"], b1: ["var(--bench-1)", "dash"], b2: ["var(--bench-2)", "dot"],
    b3: ["var(--bench-3)", "dash"], grey: ["var(--bench-3)", "line"], faint: ["var(--line-3)", "line"], s2: ["var(--s2)", "line"], s3: ["var(--s3)", "line"], s4: ["var(--s4)", "line"], s5: ["var(--s5)", "line"] };
  U.lineOpts = (k) => {
    if (k === "you") return SERIES.youLine();
    /* the same book before tax: the bright hue, dashed and thinner (season 2) */
    if (k === "youdash") return { color: css("--s1"), lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    if (k === "pick") return SERIES.pick();
    if (k === "b1" || k === "b2" || k === "b3") return SERIES.bench(+k[1]);
    if (k === "grey") return { color: css("--bench-3"), lineWidth: 1, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    /* the crowd behind a comparison: 1 px at about 30% so the named lines (benchmarks, the main book) stand out */
    if (k === "faint") return { color: rgba(css("--bench-3"), 0.3), lineWidth: 1, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    return { color: css(`--${k}`), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 3, crosshairMarkerBorderColor: css("--card") };
  };
  /* points [[date, value]] → ascending, unique, finite (Lightweight Charts refuses anything else) */
  U.pts = (arr, scale = 1) => {
    const m = new Map();
    (arr || []).forEach((p) => { if (p && p[0] && ok(p[1])) m.set(p[0], p[1] * scale); });
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([time, value]) => ({ time, value }));
  };
  /* specs: [{label, points, style, fmt, tip}] drawn greys first, then benchmarks, then the picked line, then you */
  U.lines = (box, specs, { euro = false, pct = false, digits = 2, fmtv } = {}) => {
    const chart = U.lwc(box, { euro, pct, digits });
    if (!chart) return null;
    const rank = (s) => (s === "grey" || s === "faint" ? 0 : s[0] === "b" ? 1 : s === "pick" || /^s\d$/.test(s) ? 2 : 3);
    const made = specs.filter((s) => s.points && s.points.length).sort((a, b) => rank(a.style) - rank(b.style)).map((s) => {
      const series = s.style === "area" ? chart.addAreaSeries(SERIES.you()) : chart.addLineSeries({ ...U.lineOpts(s.style), ...(s.opts || {}) });
      series.setData(U.pts(s.points, s.scale || 1));
      return { ...s, series };
    });
    chart.timeScale().fitContent();
    crosshairTip(chart, box, made.filter((m) => m.style !== "grey" && m.style !== "faint" && m.tip !== false).reverse()
      .map((m) => ({ series: m.series, label: m.label, c: (U.KEY[m.style] || U.KEY.grey)[0], fmt: m.fmt || fmtv || ((v) => U.num(v)) })));
    return { chart, made };
  };
  U.legend = (specs) => legend(specs.map((s) => ({ c: (U.KEY[s.style] || U.KEY.grey)[0], style: (U.KEY[s.style] || U.KEY.grey)[1], label: s.label, value: s.value })));
  /* shade the live span of a time chart (an overlay placed from the time scale) */
  U.shadeFrom = (res, box, date, label = "Live") => {
    if (!res || !date) return;
    const all = res.made.flatMap((m) => U.pts(m.points).map((p) => p.time)).sort();
    const at = all.find((t) => t >= date);
    if (!at) return;
    const sh = h("div", { class: "lab-shade", "aria-hidden": "true" }, h("span", {}, label));
    box.append(sh);
    const ts = res.chart.timeScale();
    const place = () => { const x = ts.timeToCoordinate(at); if (x == null) { sh.hidden = true; return; } sh.hidden = false; sh.style.left = `${Math.round(x)}px`; sh.style.width = `${Math.max(0, ts.width() - x)}px`; };
    ts.subscribeVisibleLogicalRangeChange(place);
    ts.subscribeSizeChange(place);
    setTimeout(place, 30);
  };

  /* ---------------------------------------------------------------- SVG charts drawn at their real pixel width */
  /* hgt: a number (fixed px), "auto" (the drawing sets its own height) or null (fills the box CSS sizes: .lab-fill) */
  U.svgBox = (hgt, draw, cls = "") => {
    const fixed = typeof hgt === "number", auto = hgt === "auto";
    const box = h("div", { class: `lab-svg ${cls}`.trim(), style: fixed ? `height:${hgt}px` : null });
    let w0 = 0, h0 = 0;
    const paint = () => {
      const w = Math.floor(box.clientWidth), hh = fixed ? hgt : auto ? 1 : Math.floor(box.clientHeight);
      if (!w || !hh || (w === w0 && hh === h0)) return;
      w0 = w; h0 = hh;
      try { box.replaceChildren(draw(w, hh)); } catch (e) { console.error(e); box.replaceChildren(h("p", { class: "note" }, "Chart unavailable.")); }
    };
    if (window.ResizeObserver) { const ro = new ResizeObserver(paint); ro.observe(box); U.observers.push(ro); }
    setTimeout(paint, 0);
    return box;
  };
  U.lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / ((d1 - d0) || 1)) * (r1 - r0);
  U.ticks = (lo, hi, n = 5) => {
    const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || mag * 10;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : +v.toPrecision(10));
    return out;
  };
  U.svg = (w, hh, label, ...kids) => h("svg", { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: "img", "aria-label": label }, kids);
  U.t = (x, y, text, attrs = {}) => h("text", { x, y, ...attrs }, text);
  /* one row per item on a shared horizontal scale: band (shaded), whisker, box, mid tick, dot, grey marks */
  U.rowPlot = ({ rows, lo, hi, band, fmtx = (v) => U.num(v), label, axis, rowH = 22, labelW = 58, valW = 92 }) => U.svgBox(rows.length * rowH + 30 + (axis ? 14 : 0), (w, H0) => {
    const H = H0 - (axis ? 14 : 0);
    const x = U.lin(lo, hi, labelW + 6, w - valW - 6), top = 4, y = (i) => top + i * rowH + rowH / 2;
    const tk = U.ticks(lo, hi, w < 480 ? 4 : 6);
    const g = [];
    if (band) g.push(h("rect", { x: x(band[0]), y: top, width: Math.max(1, x(band[1]) - x(band[0])), height: rows.length * rowH, class: "band", "data-tip": band[2] || "" }));
    tk.forEach((v) => g.push(h("line", { x1: x(v), x2: x(v), y1: top, y2: top + rows.length * rowH, class: v === 0 ? "zero" : "grid" }), U.t(x(v), H - 6, fmtx(v), { class: "ax", "text-anchor": "middle" })));
    rows.forEach((r, i) => {
      const cy = y(i);
      g.push(h("g", { class: `row ${r.cls || ""}`, "data-tip": r.tip || null },
        h("rect", { x: 0, y: cy - rowH / 2, width: w, height: rowH, class: "hit" }),
        U.t(0, cy + 4, r.label, { class: "lbl" }),
        r.grey ? h("line", { x1: x(r.grey[0]), x2: x(r.grey[1]), y1: cy + 5, y2: cy + 5, class: "greyl" }) : null,
        r.greyDot != null ? h("circle", { cx: x(r.greyDot), cy: cy + 5, r: 2.6, class: "greyd" }) : null,
        r.whisker ? h("line", { x1: x(r.whisker[0]), x2: x(r.whisker[1]), y1: cy, y2: cy, class: "wh" }) : null,
        r.box ? h("rect", { x: x(r.box[0]), y: cy - 5, width: Math.max(2, x(r.box[1]) - x(r.box[0])), height: 10, class: "bx" }) : null,
        r.mid != null ? h("line", { x1: x(r.mid), x2: x(r.mid), y1: cy - 7, y2: cy + 7, class: "md" }) : null,
        r.dot != null ? h("circle", { cx: x(U.clamp(r.dot, lo, hi)), cy, r: 4.2, class: "dot" }) : null,
        U.t(w, cy + 4, r.value || "", { class: "val", "text-anchor": "end" })));
    });
    if (axis) g.push(U.t((labelW + 6 + w - valW - 6) / 2, H0 - 3, axis, { class: "ax axcap", "text-anchor": "middle" }));
    return U.svg(w, H0, label, g);
  }, "lab-rows");

  /* diverging rows: label · bar around zero · value (feature contributions, coefficients, differences) */
  U.divRows = (items, { max, fmtv = (v) => `${sign(v, U.NF[1])}`, unit = "" } = {}) => {
    const m = max || Math.max(1e-9, ...items.map((x) => Math.abs(x.v || 0)));
    return h("div", { class: "lab-div" }, items.map((x) => h("div", { class: `r ${x.cls || ""}`, "data-tip": x.tip || null },
      h("span", { class: "n", title: x.label }, x.label), dbar(x.v || 0, m), h("span", { class: `v ${tone(x.v)}` }, ok(x.v) ? `${fmtv(x.v)}${unit}` : "—"))));
  };

  /* ---------------------------------------------------------------- live marks on the desk (paper book names only) */
  U.onQuote = (key, q) => {
    const cell = U.live.get(key);
    if (!cell || !ok(q.mid)) return;
    setText(cell.mark, U.px(q.mid), Math.sign(q.mid - (cell.last || q.mid)));
    cell.last = q.mid;
    cell.tag.hidden = false;
    const pnl = (q.mid - cell.p.entry_fill) * cell.p.shares;
    cell.pnl.replaceChildren(signed(pnl, fmt.n2));
  };

  U.cleanup = () => {
    U.charts.forEach(dropChart); U.charts = [];
    U.observers.forEach((o) => o.disconnect()); U.observers = [];
    U.timers.forEach((t) => clearInterval(t)); U.timers = [];
    U.live.clear();
    hideTip();
  };
  return U;
})();

/* ================================================================ page-level states: not started, building, rules changed */
const LAB_STEPS = [
  "Check that nothing still imports the retired model desk",
  "Archive the model desk's state (kept, never deleted)",
  "Check the verified inputs: dividends and the L&S calendar",
  "Write the trial ledger: every configuration tried so far",
  "Build the closes store: fresh cache first, else up to 111 requests, 1.5 s apart",
  "Register season S1: rules and scorecard fixed before any live result",
  "Walk forward from 2009 and evaluate every book",
  "Queue the practice drills",
  "Go live from the first session end after registration",
];
function labGate(el, sub, sum) {
  const U = LabUI;
  if (sum.state === "migrating") { labSeason2Gate(el, sub, sum); return; }
  const m = sum.migration || { steps: 9, step: 0, status: "waiting" };
  const building = sum.state === "building" || m.running;
  const steps = m.steps || 9, step = m.step || 0;
  const stopped = (st) => st === "failed" || st === "interrupted";
  const meter = h("div", { class: "lab-setup" });
  const paintMeter = (mm, job) => {
    const run = job && job.running;
    const count = run && ok(run.total) ? (run.step === "downloads" ? ` · price history ${U.int(run.done)} of ${U.int(run.total)}` : ` · session ${U.int(run.done)} of ${U.int(run.total)}`) : "";
    const now = mm.status === "interrupted" ? `Stopped at step ${mm.step}: ${mm.label || ""}` : mm.label ? `Now: ${mm.label}${count}` : "Starts by itself, outside 22:30–23:30 Berlin";
    U.fill(meter,
      h("div", { class: "section-l" }, mm.step ? `Setting up: step ${mm.step} of ${mm.steps || 9}` : "Not started"),
      progress(mm.step ? mm.step / (mm.steps || 9) : 0, { kind: mm.status === "failed" ? "bad" : mm.status === "interrupted" ? "warn" : "" }),
      h("p", { class: "note" }, now),
      building && !stopped(mm.status) ? h("p", { class: "note" }, h("b", {}, "Keep SV Terminal open until this finishes.")) : null,
      mm.error ? h("p", { class: "callout lab-err" }, h("b", {}, mm.status === "interrupted" ? "The last attempt was cut short: " : "The last attempt stopped: "), prose(mm.error)) : null);
  };
  const ok = (x) => x != null && Number.isFinite(x);
  paintMeter(m, null);
  const startBtn = sum.start_allowed ? h("button", { class: "btn primary", type: "button", onclick: async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = "Starting…";
    try { await post("/api/lab/start", { confirm: true }); U.dropCache(); toast("LAB", "Set-up started: about 4 minutes."); Router.render(); }
    catch (x) { toast("LAB", x.message); b.disabled = false; b.textContent = "Start the lab"; }
  } }, "Start the lab") : null;
  el.append(...U.head(sub));
  if (sum.demo) el.append(...U.strips(sum));
  el.append(section("start", building ? "The lab is setting up" : "Start the lab", [
    meter,
    startBtn ? h("div", { class: "actions" }, startBtn, m.step ? h("span", { class: "note", title: m.status === "interrupted"
      ? "SV Terminal was closed before the set-up finished. This starts it again (it also restarts by itself at the next start); the registration time stays the same."
      : "The first attempt did not finish. This retries it; finished downloads are reused and the registration time stays the same." }, "retries the last attempt") : null) : null,
    h("dl", { class: "kv" }, h("div", {}, h("dt", {}, "Starting book"), h("dd", {}, "€10,000 paper")), h("div", {}, h("dt", {}, "Real orders"), h("dd", {}, "none")),
      h("div", {}, h("dt", {}, "Set-up"), h("dd", {}, "about 4 minutes")))],
    { hint: "Starting the lab downloads up to 111 price histories from Lang & Schwarz (one request every 1.5 s), fixes the rules and the scorecard before any live result, trains the learners on 2009–2015, replays 2016 to today once and then trades on paper from the next session end. Runs only while SV Terminal is open." }));
  el.append(section("steps", "Steps", h("ol", { class: "lab-steps" }, LAB_STEPS.map((t, i) => {
    const k = i + 1, st = k < step || (k === step && m.status === "done") ? "done" : k === step ? (stopped(m.status) ? "failed" : "now") : "wait";
    return h("li", { class: st }, h("span", { class: "ix" }, k), h("span", { class: "t" }, t),
      st === "done" ? badge("Done", "ok") : st === "now" ? badge("Running", "warn") : st === "failed" ? badge("Stopped", "bad") : badge("Waiting", "na"));
  })), { fold: true }));
  if (building) {
    U.timers.push(setInterval(async () => {
      if (Router.current !== "lab") return;
      try {
        const [s, job] = await Promise.all([api("/api/lab/summary"), api("/api/lab/job").catch(() => null)]);
        if (s.state !== "building" && s.state !== "not_started") { U.dropCache(); Router.render(); return; }
        paintMeter(s.migration || m, job);
      } catch (_) { /* server restarting */ }
    }, 5000));
  }
  U.src(null, building ? "setting up" : "not started");
}
/* a new season is being set up (season 2: SEASON2_SPEC §5.4; later seasons alike): nothing is processed meanwhile */
function labSeason2Gate(el, sub, sum) {
  const U = LabUI;
  const m = sum.migration || { steps: 9, step: 0, status: "waiting", step_labels: [] };
  const target = m.season || sum.next_season || "S2";
  const sName = target === "S2" ? "season 2" : `season ${String(target).replace(/^S/, "")}`;
  const labels = m.step_labels || [];
  const done = new Set(m.done || []);
  const stopped = ["failed", "interrupted", "engine_drift"].includes(m.status);
  const startBtn = sum.start_allowed ? h("button", { class: "btn primary", type: "button", onclick: async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = "Starting…";
    try { await post("/api/lab/start", { confirm: true, season: target }); U.dropCache(); toast("LAB", `The ${sName} set-up started.`); Router.render(); }
    catch (x) { toast("LAB", x.message); b.disabled = false; b.textContent = `Set up ${sName}`; }
  } }, m.status === "waiting" ? `Set up ${sName}` : "Retry the set-up") : null;
  el.append(...U.head(sub));
  if (sum.demo) el.append(...U.strips(sum));
  el.append(section("setup", `Setting up ${sName}: step ${m.step || 0} of ${m.steps || 9}`, [
    progress((m.step || 0) / (m.steps || 9), { kind: stopped ? "bad" : "" }),
    m.label ? h("p", { class: "note" }, `${stopped ? "Stopped at" : "Now"}: ${m.label}`) : h("p", { class: "note" }, "Starts on the next scheduler tick, outside 22:30–23:30 Berlin"),
    m.error ? h("p", { class: "callout lab-err" }, h("b", {}, m.status === "engine_drift" ? "The reproduction check failed: " : "The last attempt stopped: "), prose(m.error)) : null,
    startBtn ? h("div", { class: "actions" }, startBtn) : null,
    h("dl", { class: "kv" }, h("div", {}, h("dt", {}, "Every book"), h("dd", {}, "restarts at €10,000 paper")), h("div", {}, h("dt", {}, "Real orders"), h("dd", {}, "none")))],
    { hint: prose(sum.reason || "") || "While the set-up runs the lab processes no session; sessions that end meanwhile are replayed afterwards." }));
  el.append(section("steps", "Steps", h("ol", { class: "lab-steps" }, labels.map((t, i) => {
    const k = i + 1, st = done.has(k) ? "done" : k === m.step ? (stopped ? "failed" : "now") : "wait";
    return h("li", { class: st }, h("span", { class: "ix" }, k), h("span", { class: "t" }, t),
      st === "done" ? badge("Done", "ok") : st === "now" ? badge("Running", "warn") : st === "failed" ? badge("Stopped", "bad") : badge("Waiting", "na"));
  })), { fold: true }));
  if (Array.isArray(sum.changes) && sum.changes.length) el.append(section("changes", `What ${sName} changes`, h("ul", { class: "lab-list" }, sum.changes.map((t) => h("li", {}, prose(t)))), { fold: true }));
  if (m.running || m.status === "running") U.timers.push(setInterval(async () => {
    if (Router.current !== "lab") return;
    try { const s = await api("/api/lab/summary"); if (s.state !== "migrating") { U.dropCache(); Router.render(); } } catch (_) { /* restarting */ }
  }, 5000));
  U.src(null, `${sName} set-up`);
}
function labMismatch(el, sub, sum) {
  const U = LabUI;
  el.append(...U.head(sub), ...U.strips(sum), section("mismatch", "The lab's rules changed", [
    h("p", { class: "lede" }, "Nothing is processed until that is fixed."),
    h("dl", { class: "kv" }, h("div", {}, h("dt", {}, "Season"), h("dd", {}, sum.season || "—")), h("div", {}, h("dt", {}, "Last session"), h("dd", {}, U.d(sum.as_of_session))),
      h("div", {}, h("dt", {}, "Registered"), h("dd", {}, U.d((sum.registered_at || "").slice(0, 10)))))],
    { hint: "The rules changed in the code without a new season. Committed sessions are never recomputed; a deliberate change is a new season with its own ledger line." }));
  U.src(sum, "rules changed");
}

/* ================================================================ Pages.lab: the Trading Lab tab
   In a retail investor's reading order: (1) where the €10,000 stands, after costs and tax, next to the Europe ETF and the
   S&P 500 ETF; (2) what the main book holds: paid, worth now, gain; (3) what it will do next, and when; (4) one chart;
   (5) the paper trades so far; (6) how the other strategies are doing. The strategy, its family and its clock come from
   the API (summary.champion), never from this file. */
Pages.lab = {
  title: "Trading Lab",
  async render(el, params) {
    const U = LabUI;
    U.cleanup();
    const t = guard("lab-page");
    const alive = () => t() && Router.current === "lab";
    const wait = U.loading();
    el.append(wait);
    let sum;
    try { sum = await U.get("/api/lab/summary", 20_000); }
    catch (e) { if (!alive()) return; wait.remove(); el.append(...U.head("overview"), U.errorCard(`The lab's summary could not load: ${e.message}`)); return; }
    if (!alive()) return;
    wait.remove();
    if (["not_started", "building", "migrating"].includes(sum.state)) { labGate(el, "overview", sum); return; }
    if (sum.state === "protocol_mismatch") { labMismatch(el, "overview", sum); return; }
    const job = sum.state === "behind" ? await api("/api/lab/job").catch(() => null) : null;
    if (!alive()) return;
    try { await labPage(el, sum, job, alive); }
    catch (e) { console.error(e); if (alive()) el.append(U.errorCard(`This page could not be drawn: ${e.message}`)); }
    if (!alive()) return;
    revealSection(params);
    U.src(sum, "L&S mids");
  },
  leave() { LabUI.cleanup(); },
};

/* the next decision of the main strategy's clock (Berlin), from the lab's calendar */
function labNextDecision(sum, fam) {
  const evs = ((sum.next_events || {}).events || []);
  const kind = fam === "weekly" ? "weekly" : fam === "monthly" ? "monthly" : "decide";
  const ev = evs.find((e) => e.kind === kind) || evs.find((e) => e.kind === "decide");
  const nd = sum.next_decisions || {};
  const date = fam === "weekly" ? nd.weekly_decision : fam === "monthly" ? nd.monthly_decision : null;
  return { at: ev ? ev.at : null, date: ev ? ev.session : date };
}

async function labPage(el, sum, job, alive) {
  const U = LabUI, ok = U.ok;
  const [desk, bk, lg, facts] = await Promise.all([
    U.get("/api/lab/desk").catch(() => null),
    U.get("/api/lab/book?id=MAIN&window=live").catch(() => null),
    U.get("/api/lab/league?window=live").catch(() => null),
    U.get("/api/lab/facts", 300_000).catch(() => null)]);
  if (!alive()) return;
  const sm = sum.main || {}, at = sm.after_tax || {}, pt = sm.pre_tax || {};
  const champ = sum.champion || (desk || {}).champion || {};
  const cid = champ.id || (desk && desk.champion && desk.champion.id) || null;
  const fam = champ.family || ((desk || {}).champion || {}).family;
  const n = sum.live_sessions || 0;
  const start = sum.live_start;
  const stocks = (facts || {}).stocks || {};
  const nameOf = (isin, fb) => (stocks[isin] || {}).name || fb || isin;
  const main = (desk && desk.main) || {};
  const positions = main.positions || [];
  const invested = n > 0 && (ok(at.equity) || positions.length);

  el.append(...U.head("overview"), ...U.strips({ ...sum, next_events: (sum.next_events || {}).first_live ? sum.next_events : null }, job, "desk"));

  /* ---------------------------------------------------------------- 1 · where it stands: numbers first, four tiles */
  const eq = ok(at.equity) ? at.equity : 10000;
  const ret = ok(at.ret_since_live) ? at.ret_since_live : 0;
  const etf = ok(sm.etf_since_live) ? sm.etf_since_live : null;
  const spx = (facts || {}).sp500;
  const asOf = sum.as_of_session;
  const gainEur = eq - 10000;
  const tip = (label, text) => h("span", { title: text }, label);
  el.append(section("now", null, [
    h("div", { class: "tiles" },
      h("div", { class: "tile hero" }, h("div", { class: "l" }, tip("Main book", "The main book's value after costs and tax, from €10,000 of paper money.")), h("div", { class: "v" }, eurFig(eq)),
        h("div", { class: "d" }, invested ? [delta(gainEur, ret), h("span", { class: "muted" }, ` since ${U.ds(start)}`)] : h("span", { class: "muted" }, "all cash"))),
      h("div", { class: "tile" }, h("div", { class: "l" }, tip("Europe ETF", "X1: the Europe ETF (SMEA) bought with the same €10,000 at the first fill and held, after the same costs and tax. It reinvests its dividends; the share books get none.")),
        h("div", { class: "v" }, etf != null && invested ? signed(etf, fmt.p2, true) : "—")),
      h("div", { class: "tile" }, h("div", { class: "l" }, tip("S&P 500 ETF", "The iShares Core S&P 500 ETF: price change from the close at which the books first invested, from the lab's recorded Lang & Schwarz closes. No costs, no dividends.")),
        h("div", { class: "v" }, spx && ok(spx.since) && invested ? signed(spx.since, fmt.p2, true) : "—")),
      h("div", { class: "tile" }, h("div", { class: "l" }, tip("Live record", "Sessions settled since the live start.")), h("div", { class: "v" }, U.plural(n, "session")),
        n > 0 && asOf ? h("div", { class: "d muted" }, `last ${U.ds(asOf)}`) : null)),
    n > 0 && n < 20 ? h("p", { class: "sec-note" }, "Under 20 sessions: too short to judge.") : null]));

  /* ---------------------------------------------------------------- 2 · what it holds now */
  const cash = ok(main.cash) ? main.cash : ok(sm.equity) ? null : 10000;
  const paidOf = (p) => p.shares * p.entry_fill, nowOf = (p) => p.shares * p.mark;
  const days = (d0, d1) => (d0 && d1 ? Math.max(0, Math.round((Date.parse(`${d1}T12:00:00Z`) - Date.parse(`${d0}T12:00:00Z`)) / 864e5)) : null);
  const rows = positions.map((p) => ({ ...p, name: nameOf(p.isin, p.name), sector: (stocks[p.isin] || {}).sector, paid: paidOf(p), now: nowOf(p), gain: nowOf(p) - paidOf(p), gp: nowOf(p) / paidOf(p) - 1, days: days(p.entered, asOf) }));
  const tot = rows.reduce((a, r) => ({ paid: a.paid + r.paid, now: a.now + r.now }), { paid: 0, now: 0 });
  const holdBody = rows.length ? [
    table({ cls: "lab-hold", stack: true, caption: "Main book holdings",
      cols: [
        { key: "name", label: "Share", lead: true, fmt: (r) => [h("span", { class: "nm" }, r.name), h("span", { class: "muted sm-only" }, U.sector(r.sector))] },
        { key: "sector", label: "Sector", hideSm: true, fmt: (r) => h("span", { class: "muted" }, U.sector(r.sector)) },
        { key: "shares", label: "Shares", num: true, fmt: (r) => U.int(r.shares) },
        { key: "paid", label: "Paid €", num: true, fmt: (r) => U.num(r.paid, 2) },
        { key: "now", label: "Value now €", sl: "Now €", num: true, fmt: (r) => U.num(r.now, 2) },
        { key: "gain", label: "Gain €", num: true, fmt: (r) => signed(r.gain, fmt.n2) },
        { key: "gp", label: "Gain %", num: true, fmt: (r) => signed(r.gp, fmt.p2) },
        { key: "days", label: "Days held", sl: "Days", num: true, fmt: (r) => h("span", { "data-tip": `Bought ${U.d(r.entered)} · ${U.plural(r.held, "session")} held` }, r.days == null ? "—" : U.int(r.days)) }],
      rows,
      foot: { name: "Total in shares", paid: U.num(tot.paid, 2), now: U.num(tot.now, 2), gain: signed(tot.now - tot.paid, fmt.n2), gp: tot.paid ? signed(tot.now / tot.paid - 1, fmt.p2) : "" } }),
    h("div", { class: "lab-cashline" },
      h("span", {}, "Cash ", h("b", {}, U.eur(cash))),
      ok(pt.equity) ? h("span", {}, "Before tax ", h("b", {}, U.eur(pt.equity))) : null,
      ok(sm.deferred_tax) && sm.deferred_tax > 0 ? h("span", { title: "26% of the gains not yet realised, less any tax credit: the difference between the book before and after tax." }, "Tax if sold ", h("b", {}, U.eur(sm.deferred_tax))) : null,
      ok(at.equity) ? h("span", {}, "After tax ", h("b", {}, U.eur(at.equity))) : null)]
    : [framed(n ? "No shares held: all cash." : "No shares yet.", `Cash ${U.eur(cash ?? 10000)}`)];
  el.append(section("holdings", "Holdings", holdBody, {
    hint: rows.length ? `Paid = shares × the paper fill price (costs not included); value now = shares × the last session-end price (${U.d(asOf)}, about 23:00 Berlin).` : null }));

  /* ---------------------------------------------------------------- 3 · next moves */
  const nd = labNextDecision(sum, fam);
  const pend = ((desk || {}).pending || {}).orders || [];
  const fillAt = ((sum.next_events || {}).events || []).find((e) => e.kind === "fill");
  const val = (((facts || {}).validation || {}).rows || {});
  const vw = (facts || {}).validation || {};
  const vc = val[cid], vx = val.X1;
  const stratCard = h("div", { class: "lab-strat" },
    h("div", { class: "lab-strat-h", title: cid ? U.desc(cid) || prose(champ.name || "") : "No strategy is followed: the main book holds cash." }, h("b", {}, cid ? U.nm(cid, champ.name) : "Cash"), cid ? h("span", { class: "lab-bid" }, cid) : null,
      fam ? badge(U.famWord(fam), "paper") : null),
    h("dl", { class: "kv kv-read" },
      h("dt", {}, "Decides"), h("dd", {}, nd.at ? U.relWhen(nd.at) : nd.date ? U.d(nd.date) : "—"),
      h("dt", { title: "Orders fill at the next Lang & Schwarz session end, about 23:00 Berlin." }, "Fills"), h("dd", {}, "next session end ≈23:00"),
      champ.since ? [h("dt", {}, "Since"), h("dd", {}, U.d(champ.since))] : null,
      vc && ok(vc.cagr) ? [h("dt", { title: `The validation window (${vw.from ? vw.from.slice(0, 4) : ""}–${vw.to ? vw.to.slice(0, 4) : ""}), before the live start: the same rules run on past prices, after costs and tax. Backtests use today's index members, which flatters them; only the live record counts.` }, "Backtest"),
        h("dd", {}, `${sign(vc.cagr, fmt.p1)} a year${ok(vc.max_dd) ? ` · worst fall ${sign(vc.max_dd, fmt.p1)}` : ""}`,
          vx && ok(vx.cagr) ? h("span", { class: "muted" }, `Europe ETF ${sign(vx.cagr, fmt.p1)}${ok(vx.max_dd) ? ` · ${sign(vx.max_dd, fmt.p1)}` : ""}`) : null)] : null));
  const orderRows = pend.map((o) => ({ ...o, name: nameOf(o.isin, o.name) }));
  const ordersBody = orderRows.length ? table({ cls: "lab-orders", stack: true, caption: "Orders waiting",
    cols: [{ key: "name", label: "Share", lead: true, fmt: (o) => h("span", { class: "nm" }, o.name) },
      { key: "side", label: "Order", fmt: (o) => badge(o.side === "exit" ? "Sell" : "Buy", o.side === "exit" ? "down" : "up") },
      { key: "shares", label: "Shares", num: true, fmt: (o) => (o.side === "exit" ? U.int(o.shares) : h("span", { class: "muted", "data-tip": "Whole shares worth up to the ticket, counted at the fill price" }, "at the fill")) },
      { key: "ticket", label: "Ticket €", num: true, fmt: (o) => (ok(o.ticket_eur) ? U.num(o.ticket_eur, 0) : "—") }],
    rows: orderRows })
    : framed("No orders waiting.");
  el.append(section("next", "Next moves", h("div", { class: "lab-next2" }, stratCard,
    h("div", { class: "lab-pend" }, h("div", { class: "lab-sub" }, "Orders waiting", fillAt && orderRows.length ? h("span", { class: "muted" }, ` · fill ${U.relIn(fillAt.at)}`) : null), ordersBody)),
    { hint: "What the main book will do on paper. The lab places no real orders." }));

  /* ---------------------------------------------------------------- 4 · one chart */
  const pts = (bk && (bk.after_series || bk.equity_series)) || [];
  const chartBody = h("div", { class: "lab-chartbox" });
  el.append(section("chart", "Book vs ETFs", chartBody, { hint: `Change since ${U.d(start)}: the main book after costs and tax, the Europe ETF book after the same costs and tax, the S&P 500 ETF's price.` }));
  if (pts.length < 2) chartBody.append(framed("Chart starts after two sessions."));
  else {
    const withStart = (arr) => (start && arr.length && arr[0][0] > start ? [[start, 0], ...arr] : arr);
    const rel = (arr) => withStart((arr || []).map(([d, v]) => [d, v / 10000 - 1]));
    const specs = [
      { label: "Main book", points: rel(pts), style: "area", scale: 100, fmt: (v) => `${sign(v / 100, fmt.p2)}` },
      { label: "Europe ETF", points: rel(((bk.bench_series || {}).X1) || []), style: "b1", scale: 100, fmt: (v) => `${sign(v / 100, fmt.p2)}` },
      spx && spx.series && spx.series.length ? { label: "S&P 500 ETF", points: withStart(spx.series), style: "b2", scale: 100, fmt: (v) => `${sign(v / 100, fmt.p2)}` } : null].filter(Boolean);
    const box = h("div", { class: "chart" });
    chartBody.append(U.legend(specs.map((x) => ({ ...x, value: x.points.length ? sign(x.points[x.points.length - 1][1], fmt.p2) : null }))), box);
    U.lines(box, specs, { pct: true, digits: 1 });
  }

  /* ---------------------------------------------------------------- 5 · recent trades */
  const fills = ((bk || {}).fills || []).filter((f) => f.side === "buy" || f.side === "sell").map((f) => ({ ...f, name: nameOf(f.isin), cost: (+f.fee || 0) + (+f.spread || 0) + (+f.ftt || 0) }))
    .sort((a, b) => (a.session < b.session ? 1 : a.session > b.session ? -1 : 0));
  const tradeTable = (list) => table({ cls: "lab-trades", stack: true, caption: "Paper trades",
    cols: [{ key: "session", label: "Date", fmt: (f) => U.d(f.session) },
      { key: "side", label: "Order", fmt: (f) => badge(f.side === "sell" ? "Sell" : "Buy", f.side === "sell" ? "down" : "up") },
      { key: "name", label: "Share", lead: true, fmt: (f) => h("span", { class: "nm" }, f.name) },
      { key: "shares", label: "Shares", num: true, fmt: (f) => U.num(+f.shares, Number.isInteger(+f.shares) ? 0 : 2) },
      { key: "fill", label: "Price €", num: true, fmt: (f) => U.px(+f.fill) },
      { key: "cost", label: "Costs €", num: true, fmt: (f) => h("span", { "data-tip": `Fee ${U.eur(+f.fee || 0)} · spread ${U.eur(+f.spread || 0)} · transaction tax ${U.eur(+f.ftt || 0)}` }, U.num(f.cost, 2)) }],
    rows: list });
  el.append(section("trades", "Recent trades", fills.length ? U.showAll(fills, 8, tradeTable, "trades") : framed("No trades yet."),
    { hint: fills.length ? "Paper fills at the session-end price plus or minus the assumed half-spread. Costs = the €1 fee, the spread and any transaction tax." : null }));

  /* ---------------------------------------------------------------- 6 · the other strategies */
  const lrows = ((lg || {}).groups || []).filter((g) => ["daily", "weekly", "monthly", "reference"].includes(g.id)).flatMap((g) => g.rows || [])
    .filter((r) => r.id !== "X2" && r.id !== "X3")
    .map((r) => ({ ...r, fam: r.family || (r.id === "X1" ? null : r.clock === "MONTH_CLOSE" ? "monthly" : r.clock === "WEEK_CLOSE" ? "weekly" : "daily") }))
    .sort((a, b) => (ok(b.cum_after) ? b.cum_after : -9) - (ok(a.cum_after) ? a.cum_after : -9));
  const leagueTable = (list) => table({ cls: "lab-league", caption: "Strategies",
    rowCls: (r) => (r.id === cid ? "you" : r.id === "X1" ? "ref" : null),
    cols: [{ key: "id", label: "", w: "4.5em", fmt: (r) => h("span", { class: "lab-bid" }, r.id) },
      { key: "name", label: "Strategy", fmt: (r) => h("span", { class: "nm", "data-tip": U.desc(r.id) || r.name }, U.nm(r.id, r.name), r.id === cid ? badge("Main book", "paper") : r.id === "X1" ? badge("Benchmark", "ref") : null) },
      { key: "fam", label: "Family", hideSm: true, fmt: (r) => (r.fam ? U.famWord(r.fam) : "Hold") },
      { key: "cum_after", label: `Since ${U.ds(start)}`, num: true, fmt: (r) => (ok(r.cum_after) && r.sessions ? signed(r.cum_after, fmt.p2) : h("span", { class: "muted" }, "—")) }],
    rows: list });
  el.append(section("league", "Other strategies", lrows.length ? U.showAll(lrows, 8, leagueTable, "strategies") : framed("No live figures yet."),
    { hint: `Each strategy trades its own €10,000 of paper money, after costs and tax. Sorted by result over ${U.plural(n, "session")}: a short record like this says nothing about which is better. X4, X6 and X7 pick shares at random.` }));
}
