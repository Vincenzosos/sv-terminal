/* Claude Portfolio (#/cp), the whole site: a rule-bound paper portfolio of S&P 500 stocks whose target weights Claude
   sets twice a week; an Interactive Brokers demo account executes them; every decision is fingerprinted before it trades.
   Redesign of 27 Oct 2026 (brief: SVTerminal_dev/redesign/SPEC.md; styles: css/cp.css), review fixes of 28 Oct 2026.
   29 Oct 2026: four tabs instead of one long page (the owner's request: sections you click to). Each tab is rendered
   once and shown or hidden, so a switch is instant and loads nothing:
     Overview (#/cp)                    hero and scoreboard, Record (chart and track record)
     Holdings (#/cp?tab=holdings)       holdings with their theses, allocation, the next orders while a decision is pending
     Decisions (#/cp?tab=decisions)     every decision: Claude's note, changes, fills, fingerprints
     How it works (#/cp?tab=method)     an index row, then the pipeline and the week, Rules, Verify, Built by, Legal
   The one-line disclaimer sits above every tab, and each tab but the last ends with a link to the next one.
   Every number comes from /api/cp/summary, /holdings, /updates, /curve (or plain arithmetic on them); a missing datum
   shows a designed empty state, never a guess. Nodes are built with h() only (no innerHTML with API text). */
(function () {
  const usd = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" });
  const usd0 = new Intl.NumberFormat(LOCALE, {
    style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0,
  });
  const ok = (x) => x != null && Number.isFinite(x);
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const REPO_URL = "https://github.com/Vincenzosos/sv-terminal";
  const HISTORY_URL = `${REPO_URL}/commits/gh-pages`;
  /* the tabs: id and label (index.html's #cp-nav has the same four links; the fourth reads "Method" on narrow phones) */
  const TABS = [["overview", "Overview"], ["holdings", "Holdings"], ["decisions", "Decisions"], ["method", "How it works"]];
  const TAB_IDS = new Set(TABS.map((t) => t[0]));
  /* the tab that holds each section: a link to a section (#/cp?sec=<id>, the one-page site's links) opens that tab */
  const SEC_TAB = {
    hero: "overview", record: "overview", holdings: "holdings", decisions: "decisions",
    method: "method", rules: "method", verify: "method", about: "method", legal: "method",
  };
  /* the parts of How it works, in page order, for its index row */
  const METHOD_PARTS = [["method", "Pipeline"], ["rules", "Rules"], ["verify", "Verify"], ["about", "Built by"], ["legal", "Legal"]];
  /* the author line when the page has none: publish.py writes the public one (meta name=author, link rel=author) from
     data/publish/config.json "author"; the local app has no such tags. Keep the two in step. */
  const AUTHOR = { name: "Vincenzo Silvestri", url: "https://www.linkedin.com/in/vincenzopiosilvestri" };
  const DISCLAIMER = "Paper money · educational · not investment advice · not affiliated with Anthropic";
  const LEGAL = "Paper money only: an educational experiment, not a financial service and not investment advice, not a " +
    "recommendation or solicitation to buy or sell any security. Past or simulated results do not predict future results. " +
    "Not affiliated with Anthropic; Claude is used as a tool. Prices: Lang & Schwarz indications, for personal use. " +
    "Member list: Wikipedia (CC BY-SA 4.0).";
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NARROW_CHART = 600;                      // below this plot width: no series titles, no marker labels

  /* ---------------------------------------------------------------- formatting */
  const m$ = (x) => (ok(x) ? unsigned(x, usd) : "—");
  const s$ = (x) => (ok(x) ? sign(x, usd) : "—");
  const sp = (x, f = fmt.p2) => (ok(x) ? sign(x, f) : "—");
  const wp = (x) => (ok(x) ? unsigned(x, fmt.p1) : "—");
  const p0 = (x) => (ok(x) ? fmt.p0.format(x) : "—");
  const n2 = (x) => (ok(x) ? fmt.n2.format(x) : "—");
  const tn = (x, text) => h("span", { class: ok(x) ? tone(x) || null : null }, text);
  const gapPts = (a, b) => (ok(a) && ok(b) ? (a - b) * 100 : null);
  const ptsTxt = (d) => (ok(d) ? `${sign(d, fmt.n2)} pts` : "—");
  const wdOf = (s) => WD[new Date(`${s.slice(0, 10)}T12:00:00Z`).getUTCDay()];
  const wday = (s) => (s ? `${wdOf(s)} ${dayShort(s)}` : "—");
  const wdayLong = (s) => `${wdOf(s)} ${day(s)}`;
  const BERLIN_DAY = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const BERLIN_PARTS = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const berlinDate = (iso) => {
    try { return BERLIN_DAY.format(new Date(iso)); } catch (_) { return null; }
  };
  const todayBerlin = () => BERLIN_DAY.format(new Date());
  /* "28 Oct 00:20 Berlin" (with the year on request), the time zone every other time on the page uses */
  function berlinStamp(iso, year = false) {
    const d = new Date(iso);
    if (isNaN(d)) return null;
    const p = Object.fromEntries(BERLIN_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
    return `${+p.day} ${MONTHS[+p.month - 1]}${year ? ` ${p.year}` : ""} ${p.hour}:${p.minute} Berlin`;
  }
  function utcStamp(iso, zone = true) {
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    const z = d.toISOString();
    return `${day(z)}, ${z.slice(11, 16)}${zone ? " UTC" : ""}`;
  }
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  /* the next Monday to Friday after the date d: a Wednesday decision trades Thursday, Friday's closes trade Monday
     (the broker job runs on those days; exchange holidays are not modelled, hence "scheduled") */
  function tradeDay(d) {
    const t = new Date(`${d.slice(0, 10)}T12:00:00Z`);
    do t.setUTCDate(t.getUTCDate() + 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6);
    return t.toISOString().slice(0, 10);
  }
  /* a pending decision that changes nothing (no new or closed names, every weight change under the minimum change):
     no orders are due, so it never reads "orders scheduled" (29 Oct 2026) */
  const quiet = (u) => !!(u && u.pending && u.status === "ok" && !(u.new || []).length && !(u.closed || []).length
    && !(u.resized || []).length);
  /* a pending decision whose orders are due: every "orders scheduled" wording asks this */
  const scheduled = (u) => !!(u && u.pending && !quiet(u));
  /* the next decision as words: "today, evening" on a decision day before it runs, else "Sat 31 Oct" */
  const isWed = (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 3;
  const partOfDay = (d) => (isWed(d) ? "evening" : "morning");
  const nextWhen = (d) => (!d ? "—" : d === todayBerlin() ? `today, ${partOfDay(d)}` : wday(d));
  function limitsOf(s) {
    if (s && s.limits) return s.limits;
    const m = /(\d+) to (\d+)/.exec((s && s.rules && s.rules[1]) || "");
    return m ? { positions_min: +m[1], positions_max: +m[2] } : {};
  }
  /* the author line publish.py writes into the public page (meta name=author, link rel=author); the local app, which has
     none, uses AUTHOR */
  function author() {
    const meta = document.querySelector('meta[name="author"]');
    if (!meta) return AUTHOR;
    const link = document.querySelector('link[rel="author"]');
    const url = link && /^https:\/\//.test(link.href) ? link.href : null;
    return { name: meta.content || null, url };
  }
  const profileSite = (url) => (/linkedin\.com\//i.test(url) ? "LinkedIn" : /github\.com\//i.test(url) ? "GitHub" : "profile");

  /* ---------------------------------------------------------------- small parts */
  const chev = () => h("svg", { class: "cp-chev", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true" },
    h("path", {
      d: "M2.5 4.5 6 8l3.5-3.5", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round",
    }));
  const lockIc = () => h("svg", { viewBox: "0 0 12 12", width: 12, height: 12, fill: "none", "aria-hidden": "true" },
    h("rect", { x: 2.5, y: 5.5, width: 7, height: 5, rx: 1, stroke: "currentColor", "stroke-width": 1.2 }),
    h("path", { d: "M4 5.5V4a2 2 0 0 1 4 0v1.5", stroke: "currentColor", "stroke-width": 1.2 }));
  const arrowIc = () => h("svg", { viewBox: "0 0 24 12", width: 24, height: 12, fill: "none", "aria-hidden": "true" },
    h("path", { d: "M1 6h21M17 1.5 22 6l-5 4.5", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  const newTab = h.bind(null, "span", { class: "sr-only" }, " (opens in a new tab)");
  const extLink = (href, text, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls || null }, text, newTab());
  const ext = (text) => extLink(HISTORY_URL, text);
  const announce = (msg) => {
    const a = $("cp-announce");
    if (a) { a.textContent = ""; setTimeout(() => { a.textContent = msg; }, 30); }
  };
  /* a fingerprint shortened on screen (full in the title), with a Copy button named after what it fingerprints */
  function hashRow(full, what) {
    if (!full) return h("span", { class: "ink3" }, "—");
    const code = h("code", { class: "cp-hash", title: full }, full);
    const label = `Copy the full fingerprint${what ? ` of ${what}` : ""}`;
    const b = h("button", { class: "cp-copy", type: "button", "aria-label": label }, "Copy");
    b.addEventListener("click", async () => {
      let done = false;
      try { await navigator.clipboard.writeText(full); done = true; } catch (_) { /* no clipboard: select instead */ }
      if (!done) {
        const r = document.createRange();
        r.selectNodeContents(code);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      b.textContent = done ? "Copied" : "Select and copy";
      b.classList.toggle("done", done);
      if (done) announce("Fingerprint copied");
      clearTimeout(b._t);
      b._t = setTimeout(() => { b.textContent = "Copy"; b.classList.remove("done"); }, 1600);
    });
    return h("span", { class: "cp-hashrow" }, code, b);
  }
  /* a section's head: eyebrow (the section's name), title, dek. level 1 for the first section of a tab: each tab is read
     as a page of its own, with one h1 (Overview's is the hero question) */
  const secHead = (eyebrow, id, title, dek, extra, level = 2) => h("header", { class: "cp-head" },
    h("p", { class: "cp-eyebrow" }, eyebrow), h(`h${level}`, { id: `h-${id}`, tabindex: "-1" }, title),
    dek ? h("p", { class: "cp-dek" }, dek) : null, extra || null);
  const sec = (id, ...kids) => h("section", { class: "cp-sec", "data-sec": id, "aria-labelledby": `h-${id}` },
    h("div", { class: "cp-wrap" }, ...kids));
  const failed = (e) => framed(`This part could not load: ${(e && e.message) || "no answer"}. The rest of the site is unaffected.`);
  function more(summary, body, { open = false, cls = "" } = {}) {
    return h("details", { class: `cp-more${cls ? ` ${cls}` : ""}`, open: open || null },
      h("summary", {}, summary), h("div", { class: "cp-more-b" }, body));
  }
  /* Tables restyled as grids on phones lose their table semantics in some screen readers: say them explicitly */
  function tableRoles(tbl) {
    tbl.setAttribute("role", "table");
    tbl.querySelectorAll("thead, tbody, tfoot").forEach((g) => g.setAttribute("role", "rowgroup"));
    tbl.querySelectorAll("tr").forEach((r) => r.setAttribute("role", "row"));
    tbl.querySelectorAll("th").forEach((c) => c.setAttribute("role", c.getAttribute("scope") === "row" ? "rowheader" : "columnheader"));
    tbl.querySelectorAll("td").forEach((c) => c.setAttribute("role", "cell"));
    return tbl;
  }
  /* Rules text: numbers wrapped in spans (a text split, never innerHTML) */
  const numberize = (t) => String(t).split(/(S&P 500)/).flatMap((part) => (part === "S&P 500" ? [part]
    : part.split(/(\$?\d[\d,]*(?:\.\d+)?%?(?:\s?to\s?\d+)?)/g).map((p, i) => (i % 2 ? h("span", { class: "cp-num" }, p) : p))));
  function download(name, data, asOf) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = h("a", { href: url, download: `claude-portfolio-${name}-${asOf || "latest"}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  /* SHA-256 of a text, as 64 hex characters (WebCrypto; null where the browser has none) */
  async function sha256(text) {
    if (!(window.crypto && crypto.subtle)) return null;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let counted = false;                          // the hero value counts up once per page load
  function countUp(el, from, to) {
    if (counted || still() || !ok(from) || !ok(to)) { el.textContent = m$(to); return; }
    counted = true;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 800), e = 1 - (1 - k) ** 3;
      el.textContent = m$(from + (to - from) * e);
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
      else el.textContent = m$(to);
    };
    el.textContent = m$(from);
    requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------------- header: status pill and mini scoreboard */
  /* the pill's words. w1 is all that shows where the header is short (phones, and next to the small scoreboard), so it
     names the day: "Orders Thu"; the full line is the label and the tooltip */
  function pillWords(s) {
    let kind = "steady", w1, rest, full;
    /* a pending decision that changes nothing (the summary counts its changes): "No changes · next decision ..." */
    const noOrders = s.state === "live" && s.pending && s.pending.changes === 0;
    if ((s.pending || s.state === "decided") && !noOrders) {
      const td = s.pending ? tradeDay(s.pending.decided_on) : null;
      w1 = td ? `Orders ${wdOf(td)}` : "Orders";
      rest = td ? ` ${dayShort(td)}, 20:15 Berlin` : " scheduled";
      full = td ? `Orders scheduled · ${wday(td)}, 20:15 Berlin` : "Orders scheduled";
    } else if (s.state === "live") {
      kind = "live"; w1 = noOrders ? "No changes" : "Running"; rest = ` · next decision ${nextWhen(s.next_decision)}`;
    } else {
      kind = "idle"; w1 = "Starting"; rest = ` · first decision ${nextWhen(s.next_decision)}`;
    }
    return { kind, w1, rest, full: full || w1 + rest };
  }
  function statusPill(s) {
    const el = $("cp-status");
    if (!el) return;
    if (!s) { el.replaceChildren(); return; }
    const { kind, w1, rest, full } = pillWords(s);
    /* the public site is a snapshot: no pulsing dot that would suggest real-time data */
    el.className = `cp-status is-${kind}${window.BussolaStatic ? " still" : ""}`;
    el.setAttribute("aria-label", full);
    el.title = full;
    el.replaceChildren(h("i", { "aria-hidden": "true" }), h("span", { class: "w1" }, w1), h("span", { class: "rest" }, rest));
  }
  function mini(s) {
    const el = $("cp-mini");
    if (!el) return;
    if (!s || s.state !== "live") { el.hidden = true; el.replaceChildren(); return; }
    el.replaceChildren(
      h("span", { class: "k" }, "Claude"), h("b", { class: tone(s.return) || null }, sp(s.return)), h("span", { class: "sep" }, "·"),
      h("span", { class: "k" }, h("span", { class: "lg" }, "S&P 500 "), "ETF"), h("b", { class: tone(s.bench_return) || null }, sp(s.bench_return)),
      h("span", { class: "sep x-asof" }, "·"), h("span", { class: "k x-asof" }, `as of ${dayShort(s.as_of)}`));
    el.hidden = false;
  }

  /* ---------------------------------------------------------------- hero */
  function hero(D) {
    const s = D.s;
    const live = s && s.state === "live";
    const who = author();
    const lim = limitsOf(s);
    const cap = s && ok(s.capital) ? usd0.format(s.capital) : null;
    const eyebrow = ["CLAUDE PORTFOLIO", "PAPER MONEY",
      live ? `RUNNING SINCE ${day(s.start).toUpperCase()}` : s ? "NOT STARTED YET" : null].filter(Boolean).join(" · ");
    const by = who.name ? h("p", { class: "cp-by" }, "by ",
      who.url ? h("a", { href: who.url, rel: "author noopener", target: "_blank" }, who.name, newTab()) : who.name) : null;
    const picks = lim.positions_min ? `${lim.positions_min} to ${lim.positions_max} ` : "";
    const go = (href, text) => h("a", { href }, text, h("span", { "aria-hidden": "true" }, " →"));
    const text = h("div", { class: "cp-hero-text" },
      h("p", { class: "cp-eyebrow" }, eyebrow),
      h("h1", { id: "h-hero", tabindex: "-1" }, "Can Claude beat the S&P 500?"),
      by,
      h("p", { class: "cp-deck" }, `A ${cap ? `${cap} ` : ""}paper portfolio of S&P 500 stocks that Claude manages under fixed ` +
        "rules, measured against the S&P 500 ETF on the same days."),
      h("p", { class: "cp-lede" }, `Twice a week Claude picks ${picks}stocks and writes a thesis and the risks for each. ` +
        "Orders fill at an Interactive Brokers demo account, and every decision is fingerprinted and published before it trades."),
      h("p", { class: "cp-links" },
        go("#/cp?tab=method", "How it works"), go("#/cp?tab=method&sec=verify", "Check the record"),
        go("#/cp?tab=method&sec=about", "Who built it")));
    const right = h("div", { class: "cp-hero-r" }, scoreboard(D));
    return h("section", { class: "cp-hero", "data-sec": "hero", "aria-labelledby": "h-hero" },
      h("div", { class: "cp-wrap cp-hero-in" }, text, right));
  }
  function scoreboard(D) {
    const s = D.s;
    const box = h("section", { class: "cp-card cp-score", id: "cp-score", "aria-label": "Key numbers" });
    if (!s) { box.append(failed(D.err.s)); return box; }
    const live = s.state === "live";
    const lim = limitsOf(s);
    const n = D.cv ? (D.cv.points || []).length : null;
    const nd = s.next_decision;
    const today = nd && nd === todayBerlin();
    const ndFig = !nd ? "—" : today ? "Today" : wday(nd);
    const ndDet = !nd ? "" : `${today ? `${wday(nd)}, ` : ""}${partOfDay(nd)}, on ${isWed(nd) ? "the day's" : "Friday's"} closes`;
    /* Positions and Next decision open the tab that says more (Holdings, Decisions) */
    const cell = (label, fig, det, go) => (go
      ? h("a", { class: "cp-cell cp-cell-go", href: go[0] }, h("p", { class: "cp-label" }, label, h("span", { class: "cp-go", "aria-hidden": "true" }, " →")),
        h("p", { class: "cp-cfig" }, fig), h("p", { class: "cp-det" }, det), h("span", { class: "sr-only" }, `, ${go[1]}`))
      : h("div", { class: "cp-cell" },
        h("p", { class: "cp-label" }, label), h("p", { class: "cp-cfig" }, fig), h("p", { class: "cp-det" }, det)));
    const toHold = ["#/cp?tab=holdings", "see the holdings"], toDec = ["#/cp?tab=decisions", "see the decisions"];
    let fig, sub, cells, asof;
    if (live) {
      const vis = h("span", { "aria-hidden": "true" }, m$(s.value));
      fig = h("p", { class: "cp-value" }, vis, h("span", { class: "sr-only" }, m$(s.value)));
      countUp(vis, s.capital, s.value);
      const gain = ok(s.value) ? s.value - s.capital : null;
      sub = h("p", { class: "cp-vdetail" }, tn(s.return, `${arrow(s.return)} ${s$(gain)} · ${sp(s.return)}`),
        h("span", { class: "ink3" }, ` since ${dayShort(s.start)}`));
      const d = gapPts(s.return, s.bench_return);
      cells = [
        cell("S&P 500 ETF", tn(s.bench_return, `${arrow(s.bench_return)} ${sp(s.bench_return)}`), `same days, same ${usd0.format(s.capital)}`),
        cell("Difference", h("span", { class: tone(d) || null, title: "percentage points" }, ptsTxt(d)), "Claude minus the ETF"),
        cell("Next decision", ndFig, ndDet, toDec),
        cell("Positions", String(s.positions), `cash ${wp(s.cash_weight)}${ok(lim.cash_max) ? ` · limit ${p0(lim.cash_max)}` : ""}`, toHold),
      ];
      asof = `valued ${day(s.as_of)} · ~23:00 Berlin · session ${n ?? "—"} · Lang & Schwarz indicative prices`;
    } else {
      fig = h("p", { class: "cp-value" }, m$(s.capital).replace(/\.00$/, ""));
      sub = h("p", { class: "cp-vdetail ink3" }, "paper money, not invested yet");
      const td = s.pending ? tradeDay(s.pending.decided_on) : null;
      cells = [
        cell("S&P 500 ETF", "—", "starts with the first fills"), cell("Difference", "—", "Claude minus the ETF"),
        cell("Next decision", ndFig, ndDet, toDec),
        s.pending ? cell("Positions", String(s.pending.names), `first orders ${wday(td)}`, toHold) : cell("Positions", "0", "cash 100%"),
      ];
      asof = s.pending ? `first orders ${wday(td)}, 20:15 Berlin · market-on-close` : `not invested yet · first decision ${wday(nd)}`;
    }
    const st = window.BussolaStatic;
    const built = st && st.index && st.index.built ? berlinStamp(st.index.built) : null;
    if (built) asof += ` · snapshot ${built}`;
    box.append(h("p", { class: "cp-label" }, "Portfolio value"), fig, sub, h("hr"), h("div", { class: "cp-cells" }, cells),
      h("p", { class: "cp-asof" }, asof));
    return box;
  }

  /* ---------------------------------------------------------------- Overview › Record: chart, readout, track record */
  let CH = null;                                 // the chart's state: data, unit, the live chart; redrawn on unit, theme or width
  function cpChartOptions(mode) {
    const pct = mode === "pct";
    const nf = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: pct ? 1 : 0, maximumFractionDigits: pct ? 2 : 0 });
    return {
      layout: {
        background: { type: "solid", color: css("--cp-surface") }, textColor: css("--cp-ink-3"),
        fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 12, attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: css("--cp-grid") } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.12 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: 1, horzLine: { visible: false, labelVisible: false },
        vertLine: { color: css("--cp-ink-4"), width: 1, style: 2, labelVisible: false },
      },
      localization: {
        priceFormatter: pct ? (p) => `${p > 0 ? "+" : p < 0 ? MINUS : ""}${nf.format(Math.abs(p))}%`
          : (p) => `${p < 0 ? MINUS : ""}$${nf.format(Math.abs(p))}`,
      },
      handleScroll: false, handleScale: false,
    };
  }
  const timeKey = (t) => (typeof t === "string" ? t : typeof t === "number" ? new Date(t * 1000).toISOString().slice(0, 10)
    : t ? `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}` : null);
  function chartEvents(ups, dates) {
    const ev = new Map();
    const add = (d, text, u) => {
      if (dates.has(d)) ev.set(d, { text: ev.has(d) ? `${ev.get(d).text} · ${text}` : text, u });
    };
    for (const u of ups) {
      if (u.filled_on) add(u.filled_on, `${u.orders} orders filled · ${u.venue ? "Interactive Brokers demo" : "simulated"}`, u);
      const what = scheduled(u) ? `orders scheduled ${wday(tradeDay(u.date))}` : u.filled_on ? "filled later"
        : u.status === "ok" ? "no orders" : "rejected by the rules";
      add(u.date, `Decision on these closes · ${what}`, u);
    }
    return ev;
  }
  function readout(i) {
    const C = CH;
    if (!C || !C.ro) return;
    const p = C.pts[i == null ? C.pts.length - 1 : i];
    if (!p) return;
    const [d, v, b] = p;
    const pct = C.mode === "pct";
    const r = v / C.cap - 1, rb = ok(b) ? b / C.cap - 1 : null;
    const val = (x, ret) => (pct ? h("b", { class: tone(ret) || null }, sp(ret)) : h("b", {}, m$(x)));
    const ev = C.events.get(d);
    C.ro.replaceChildren(
      h("span", { class: "cp-ro-date" }, wdayLong(d)),
      h("span", { class: "cp-ro-item" }, h("i", { class: "cp-sw" }), "Claude Portfolio", val(v, r)),
      h("span", { class: "cp-ro-item" }, h("i", { class: "cp-sw bench" }), "S&P 500 ETF", ok(b) ? val(b, rb) : h("b", {}, "—")),
      h("span", { class: "cp-ro-item" }, "Gap", h("b", { class: tone(gapPts(r, rb)) || null }, ptsTxt(gapPts(r, rb)))),
      C.marks ? h("span", { class: "cp-ro-key" }, C.marks.dec ? h("span", {}, h("span", { class: "k-dec" }, "●"), " decision") : null,
        C.marks.fill ? h("span", {}, h("span", { class: "k-fill" }, "▲"), " fills") : null) : null,
      h("p", { class: "cp-ro-event" }, ev && i != null ? `${ev.text} · click to read it in Decisions` : ""));
    C.plot.classList.toggle("has-event", !!(ev && i != null));
  }
  function drawChart() {
    const C = CH;
    if (!C || !C.plot.isConnected || C.pts.length < 2) return;
    if (!C.plot.clientWidth) return;               // its tab is hidden: showTab() draws it when Overview is shown
    const chart = makeChart(C.plot, { euro: false });
    C.chart = chart;
    if (!chart) return;
    chart.applyOptions(cpChartOptions(C.mode));
    C.narrow = C.plot.clientWidth < NARROW_CHART;
    const pct = C.mode === "pct";
    const val = (x) => (pct ? (x / C.cap - 1) * 100 : x);
    /* on a narrow chart the title tags would cover the last points: the readout above names the lines instead */
    const area = chart.addAreaSeries({
      lineColor: css("--cp-series-cp"), topColor: css("--cp-area-top"), bottomColor: css("--cp-area-bot"), lineWidth: 2,
      priceLineVisible: false, lastValueVisible: true, title: C.narrow ? "" : "Claude", crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: css("--cp-surface"),
    });
    area.setData(C.pts.map(([d, v]) => ({ time: d, value: val(v) })));
    const line = chart.addLineSeries({
      color: css("--cp-series-bench"), lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: true,
      title: C.narrow ? "" : "ETF", crosshairMarkerRadius: 3, crosshairMarkerBorderColor: css("--cp-surface"),
    });
    line.setData(C.pts.filter((p) => ok(p[2])).map(([d, , b]) => ({ time: d, value: val(b) })));
    area.createPriceLine({ price: pct ? 0 : C.cap, color: css("--cp-ink-4"), lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: "start" });
    const marks = [];
    C.marks = { dec: false, fill: false };
    for (const u of C.ups) {
      if (u.filled_on && C.dates.has(u.filled_on)) {
        C.marks.fill = true;
        marks.push({ time: u.filled_on, position: "belowBar", shape: "arrowUp", color: css("--cp-series-cp"), size: 0.8,
          text: C.narrow ? "" : `${u.orders} orders` });
      } else if (!u.filled_on && C.dates.has(u.date)) {
        C.marks.dec = true;
        marks.push({ time: u.date, position: "aboveBar", shape: "circle", color: css("--cp-ink-3"), size: C.narrow ? 0.5 : 0.7 });
      }
    }
    if (!C.marks.dec && !C.marks.fill) C.marks = null;
    area.setMarkers(marks.sort((a, b) => (a.time < b.time ? -1 : 1)));
    const index = new Map(C.pts.map((p, i) => [p[0], i]));
    chart.subscribeCrosshairMove((p) => {
      const k = p && p.time ? timeKey(p.time) : null;
      readout(k && index.has(k) ? index.get(k) : null);
    });
    chart.subscribeClick((p) => {
      const ev = p && p.time ? C.events.get(timeKey(p.time)) : null;
      if (ev) openDecision(ev.u.date);
    });
    if (C.range && C.range !== "all") chart.timeScale().setVisibleRange({ from: C.range, to: C.pts[C.pts.length - 1][0] });
    else chart.timeScale().fitContent();
    readout(null);
    if (!C.revealed && !still()) { C.revealed = true; C.plot.classList.add("reveal"); }
  }
  function ranges(pts) {
    const first = pts[0][0], last = pts[pts.length - 1][0];
    const span = (Date.parse(last) - Date.parse(first)) / 86400000;
    const back = (days) => new Date(Date.parse(last) - days * 86400000).toISOString().slice(0, 10);
    const out = [];
    if (span > 31) out.push(["1M", back(31)]);
    if (span > 92) out.push(["3M", back(92)]);
    if (first.slice(0, 4) < last.slice(0, 4)) out.push(["YTD", `${last.slice(0, 4)}-01-01`]);
    if (out.length) out.push(["All", "all"]);
    return out;
  }
  function recordTitle(s, pts, cap) {
    const n = pts.length;
    const [, lv, lb] = pts[n - 1];
    const raw = gapPts(s ? s.return : lv / cap - 1, s ? s.bench_return : ok(lb) ? lb / cap - 1 : null);
    const d = ok(raw) ? Math.round(raw * 100) / 100 : null;
    if (d == null) return `The record after ${n} sessions`;
    if (d >= 0.005) return `Claude is ${fmt.n2.format(d)} points ahead of the S&P 500 ETF after ${n} sessions`;
    if (d <= -0.005) return `Claude is ${fmt.n2.format(-d)} points behind the S&P 500 ETF after ${n} sessions`;
    return `Claude is level with the S&P 500 ETF after ${n} sessions`;
  }
  function unitButtons() {
    const unit = h("div", { class: "cp-seg", role: "group", "aria-label": "Units" }, [["pct", "%", " percent"], ["usd", "$", " dollars"]]
      .map(([k, label, sr]) => h("button", {
        type: "button", "aria-pressed": String(k === "pct"),
        onclick: (e) => {
          unit.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
          CH.mode = k;
          drawChart();
        },
      }, label, h("span", { class: "sr-only" }, sr))));
    return unit;
  }
  function record(D) {
    const s = D.s, cv = D.cv;
    const pts = (cv && cv.points) || [];
    const n = pts.length;
    const live = s ? s.state === "live" : n > 0;          // without the summary, the curve itself says whether it has started
    const cap = (cv && cv.capital) || (s && s.capital);
    const title = live && n >= 2 ? recordTitle(s, pts, cap) : "The record starts with the first fills";
    const amount = ok(cap) ? usd0.format(cap) : "amount";
    const head = secHead("Record", "record", title,
      `The paper portfolio's value after each session, next to the same ${amount} invested in the S&P 500 ETF on the same days.`);
    if (!cv) return sec("record", head, h("div", { class: "cp-card" }, failed(D.err.cv)));
    const plot = h("div", { class: "cp-plot" });
    const card = h("div", { class: "cp-card cp-chart" });
    const src = h("p", { class: "cp-src" }, `Benchmark: ${(s && s.bench_name) || "S&P 500 ETF"}, bought on the same days with ` +
      `the same ${amount}. Prices: Lang & Schwarz, indicative; valued after each session, ~23:00 Berlin. ` +
      "Chart: TradingView Lightweight Charts.");
    if (!live || n < 2) {
      CH = null;
      plot.classList.add("is-empty");
      plot.append(!live ? framed("Not invested yet.", s && s.pending
        ? `The chart starts after the first fills, ${wday(tradeDay(s.pending.decided_on))}.` : "The chart starts after the first fills.")
        : framed("The comparison starts after the second valuation.",
          "The first valuation follows the first fills, after the session (~23:00 Berlin)."));
      card.append(plot, src);
      return sec("record", head, card, trackRecord(D, true));
    }
    const ro = h("div", { class: "cp-readout", "aria-hidden": "true" });
    const ups = (D.up && D.up.updates) || [];
    const dates = new Set(pts.map((p) => p[0]));
    CH = { plot, ro, pts, cap, ups, dates, events: chartEvents(ups, dates), mode: "pct", range: "all", revealed: CH ? CH.revealed : false };
    readout(null);                               // the latest values, also when the chart library is not available
    plot.setAttribute("role", "img");
    plot.setAttribute("aria-label", `Line chart from ${day(pts[0][0])} to ${day(pts[n - 1][0])}: Claude Portfolio from ` +
      `${m$(pts[0][1])} to ${m$(pts[n - 1][1])}; S&P 500 ETF from ${m$(pts[0][2])} to ${m$(pts[n - 1][2])}. ` +
      "Arrows mark the days orders were filled; dots mark decisions that placed no orders.");
    const rg = ranges(pts);
    const pills = rg.length ? h("div", { class: "cp-seg", role: "group", "aria-label": "Range" }, rg.map(([label, from]) =>
      h("button", {
        type: "button", "aria-pressed": String(from === "all"),
        onclick: (e) => {
          e.currentTarget.parentNode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
          CH.range = from;
          drawChart();
        },
      }, label))) : h("span", { class: "cp-mono-note" }, `since ${day(pts[0][0])}`);
    const rows = [...pts].reverse().map(([d, v, b]) => {
      const g = gapPts(v / cap, ok(b) ? b / cap : null);
      return h("tr", {}, h("td", {}, dayShort(d), h("span", { class: "yr" }, ` ${d.slice(0, 4)}`)), h("td", {}, m$(v)), h("td", {}, m$(b)),
        h("td", { class: tone(g) || null }, ptsTxt(g)));
    });
    const data = h("div", { class: "cp-data" }, h("table", {}, h("caption", { class: "sr-only" }, "Value after each session"),
      h("thead", {}, h("tr", {}, ["Date", "Claude Portfolio", "S&P 500 ETF", "Difference"].map((x) => h("th", { scope: "col" }, x)))),
      h("tbody", {}, rows)));
    card.append(h("div", { class: "cp-chart-top" }, ro, h("div", { class: "cp-controls" }, unitButtons(), pills)), plot, src,
      more("Show the numbers", data));
    return sec("record", head, card, trackRecord(D, false));
  }
  /* the Claude and ETF column heads of the record's tables (short names on phones) */
  const colHead = (bench, long, short) => h("th", { scope: "col" }, h("span", { class: "cp-trh" },
    h("i", { class: `cp-sw sm${bench ? " bench" : ""}` }), h("span", { class: "lg" }, long), h("span", { class: "sm" }, short)));
  const sg = (x) => (ok(x) ? tn(x, sp(x)) : "—");
  function trackRecord(D, empty) {
    const st = (D.cv && D.cv.stats) || {}, s = D.s || {};
    const n = st.sessions || 0;
    const lim = limitsOf(s);
    const left = h("div", { class: "cp-card" }, h("h3", {}, "Track record"));
    if (!n) left.append(h("p", { class: "cp-sub" }, "Statistics start at 5 sessions, counted from the first fills."));
    else if (n < 5) {
      left.append(h("p", { class: "cp-sub" }, `After ${plural(n, "session")} the record is too short for statistics. They start at 5 sessions.`));
    }
    else {
      left.append(h("p", { class: "cp-sub" }, n < 20 ? `After ${n} sessions the record is too short to judge skill.`
        : `After ${n} sessions. Past results do not predict future results.`));
      const row = (label, a, b) => h("tr", {}, h("th", { scope: "row" }, label), h("td", {}, a), h("td", {}, b));
      /* drawdown, volatility and the ratios are in the risk panel below (29 Oct 2026). Claude's return counts from its
         fills, the ETF's from the first valuation (cp_book.mark sets it to the capital there): the second row measures
         both from that valuation, like for like */
      const body = [
        row(`Return since ${day(s.start || (D.cv && D.cv.start) || "")}`, sg(st.return), sg(st.bench_return)),
        ok(st.return_from_first_mark) ? row("Return from the first valuation", sg(st.return_from_first_mark),
          sg(st.bench_return_from_first_mark)) : null,
        row("Best day", sg(st.best_day), sg(st.bench_best_day)),
        row("Worst day", sg(st.worst_day), sg(st.bench_worst_day)),
      ];
      left.append(h("table", { class: "cp-tr" }, h("caption", { class: "sr-only" }, "Track record: Claude Portfolio against the S&P 500 ETF"),
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, h("span", { class: "sr-only" }, "Measure")),
          colHead(false, "Claude Portfolio", "Claude"), colHead(true, "S&P 500 ETF", "ETF"))),
        h("tbody", {}, body)));
    }
    if (D.s && D.s.state === "live") {
      left.append(h("dl", { class: "cp-kv" },
        h("dt", {}, `Value after a ${ok(lim.tax_rate) ? p0(lim.tax_rate) : "26%"} tax if sold`),
        h("dd", {}, m$(s.after_tax_value), h("span", { class: "ink3" }, ` · tax ${m$(s.tax_if_sold)}`)),
        h("dt", {}, "Commissions paid"), h("dd", {}, m$(s.fees_paid), h("span", { class: "ink3" }, ` on ${plural(s.orders || 0, "order")}`))));
    }
    const defs = [
      ["Return", "Change in value since the start. Claude's counts from its fills at the broker's prices, after commissions; " +
        "the ETF's from the first valuation, after that session."],
      ["Return from the first valuation", "Both measured from that same first valuation, like for like."],
      ["Best and worst day", "The largest one-session rise and fall."],
      ["Risk and return", "Drawdown, volatility, beta, alpha and the other measures professionals use are in the panel below, " +
        "each with its definition and formula. A figure appears only once the record is long enough to mean something."],
    ];
    const right = h("div", { class: "cp-card proof" }, h("h3", {}, "How to read these"),
      h("dl", { class: "cp-defs" }, defs.map(([t, d]) => h("div", {}, h("dt", {}, t), h("dd", {}, d)))));
    return [h("div", { class: `cp-two${empty ? " is-empty" : ""}` }, left, right), riskPanel(D)];
  }

  /* ---------------------------------------------------------------- Overview › Record: risk and return against the ETF
     29 Oct 2026, the owner's request (a portfolio manager's advice): the measures professionals expect, "just to show
     they are there". Every row shows its name and a one-line definition from the start; a figure appears only when it
     means something: beta from 5 daily returns (with their n), the annualized measures from 20 sessions
     (cp_api._risk sends null before, so no figure from a handful of days leaves the app); drawdown from 5 sessions, like
     the track record. The exact formulas are behind "How these are computed"; the risk-free rate used is in the source line. */
  const RISK_FROM = { rel: 5, annual: 20, stats: 5 };
  const RISK_OWN = [
    ["volatility", "Volatility", "How widely the value swings from day to day, scaled to a year.", "annual", (x) => unsigned(x, fmt.p2)],
    ["max_drawdown", "Max drawdown", "The largest fall from a previous high, on the daily values.", "stats", sg],
    ["sharpe", "Sharpe ratio", "Return above the risk-free rate for each unit of volatility, per year.", "annual", (x) => unsigned(x, fmt.n2)],
  ];
  const RISK_REL = [
    ["beta", "Beta", "How much Claude's value tends to move when the ETF moves 1%.", "rel", (x) => unsigned(x, fmt.n2)],
    ["alpha", "Jensen's alpha", "Return per year beyond what the ETF's moves and Claude's beta explain.", "annual", sg],
    ["tracking_error", "Tracking error", "How far the daily returns stray from the ETF's, scaled to a year.", "annual",
      (x) => unsigned(x, fmt.p2)],
    ["information_ratio", "Information ratio", "Return ahead of the ETF for each unit of tracking error, per year.", "annual",
      (x) => unsigned(x, fmt.n2)],
  ];
  /* the formulas cp_api._risk_math and _stats compute, in the same notation */
  const RISK_FORMULAS = [
    ["Daily returns", "r = value(t) / value(t − 1) − 1, for Claude (rp) and the ETF (rb), on the sessions both have"],
    ["Risk-free rate", "rf = (1 + y)^(1/252) − 1 a day, y = the latest US 3-month Treasury bill rate (discount basis, FRED DTB3)"],
    ["sd, var, cov", "sample statistics of the daily returns (divided by n − 1)"],
    ["Volatility", "sd(r) × √252"],
    /* no-break spaces keep the bracket in one piece where the line wraps (phones) */
    ["Max drawdown", "min over t of [\u00a0value(t)\u00a0/\u00a0peak(t)\u00a0−\u00a01\u00a0], peak(t) = the highest value up to and including t"],
    ["Sharpe ratio", "mean(r − rf) / sd(r − rf) × √252"],
    ["Beta", "cov(rp, rb) / var(rb)"],
    ["Jensen's alpha", "252 × [ mean(rp − rf) − beta × mean(rb − rf) ]"],
    ["Tracking error", "sd(rp − rb) × √252"],
    ["Information ratio", "252 × mean(rp − rb) / tracking error"],
  ];
  function riskPanel(D) {
    const st = (D.cv && D.cv.stats) || {}, rk = st.risk || {};
    const sessions = rk.sessions ?? st.sessions ?? 0, n = rk.n ?? Math.max(0, sessions - 1);
    const toGo = Math.max(0, RISK_FROM.annual - sessions);
    const shown = (gate) => (gate === "rel" ? n >= RISK_FROM.rel : gate === "annual" ? sessions >= RISK_FROM.annual
      : sessions >= RISK_FROM.stats);
    /* a measure not shown yet: the cell says from when (the sessions to go are said once, in the subtitle) */
    const gated = (gate, span) => h("td", { class: "is-gated", colspan: span > 1 ? span : null },
      h("span", { class: "cp-lock" }, lockIc(), gate === "rel" ? `from ${RISK_FROM.rel} daily returns` : `from ${RISK_FROM[gate]} sessions`));
    const name = (label, def) => h("th", { scope: "row" }, h("span", { class: "cp-rk-name" }, label), h("span", { class: "cp-rk-def" }, def));
    const src = (key) => (key === "volatility" || key === "max_drawdown" ? [st[key], st[`bench_${key}`]] : [rk[key], rk[`bench_${key}`]]);
    const own = RISK_OWN.map(([key, label, def, gate, f]) => {
      const [a, b] = src(key);
      return h("tr", {}, name(label, def), shown(gate) ? [h("td", {}, f(a)), h("td", {}, f(b))] : gated(gate, 2));
    });
    const rel = RISK_REL.map(([key, label, def, gate, f]) => h("tr", {}, name(label, def), shown(gate)
      ? h("td", {}, f(rk[key]), gate === "rel" ? h("span", { class: "cp-rk-n" }, `n = ${n} daily returns`) : null)
      : gated(gate, 1)));
    const t1 = h("table", { class: "cp-tr cp-rk" }, h("caption", { class: "sr-only" }, "Risk and return of each: Claude Portfolio and the S&P 500 ETF"),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, h("span", { class: "sr-only" }, "Measure")),
        colHead(false, "Claude Portfolio", "Claude"), colHead(true, "S&P 500 ETF", "ETF"))),
      h("tbody", {}, own));
    const t2 = h("table", { class: "cp-tr cp-rk" }, h("caption", { class: "sr-only" }, "Claude Portfolio measured against the S&P 500 ETF"),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, h("span", { class: "sr-only" }, "Measure")),
        h("th", { scope: "col" }, "Claude vs ETF"))),
      h("tbody", {}, rel));
    const sub = sessions >= RISK_FROM.annual ? `After ${sessions} sessions, on n = ${n} daily returns. Past results do not predict future results.`
      : n >= RISK_FROM.rel ? `After ${plural(sessions, "session")}: beta on n = ${n} daily returns. The annualized ` +
        `measures need ${RISK_FROM.annual} sessions${toGo ? ` (${toGo} to go)` : ""}; on a handful of days they would describe noise, not skill.`
        : `The measures fill in as the record grows: beta from ${RISK_FROM.rel} daily returns, the annualized ones ` +
          `from ${RISK_FROM.annual} sessions.`;
    const rf = rk.rf;
    const fred = extLink("https://fred.stlouisfed.org/series/DTB3", "FRED series DTB3");
    const rfLine = !rf ? [] : rf.status === "unavailable" ? [" Risk-free rate unavailable, 0% used."]
      : [` Risk-free rate for the Sharpe ratio and alpha: ${fmt.n2.format(rf.pct)}% a year (discount basis), the US ` +
        `3‑month Treasury bill on ${rf.date ? day(rf.date) : "the latest date"} (`, fred,
        rf.status === "cached" ? `; the copy fetched ${rf.fetched_on ? day(rf.fetched_on) : "earlier"}, as ` +
          `${rf.refreshing ? "today's update from FRED had not arrived yet" : "FRED could not be reached"}).` : ")."];
    const how = more("How these are computed", [
      h("dl", { class: "cp-rk-f" }, RISK_FORMULAS.map(([t, f]) => h("div", {}, h("dt", {}, t), h("dd", {}, h("code", {}, f))))),
      h("p", {}, `Shown only when they can mean something: beta from ${RISK_FROM.rel} daily returns, the ` +
        `annualized measures from ${RISK_FROM.annual} sessions; 252 sessions make a year. Claude's values are after commissions.`),
    ]);
    return h("div", { class: "cp-card cp-risk" }, h("h3", {}, "Risk and return vs the S&P 500 ETF"), h("p", { class: "cp-sub" }, sub),
      h("div", { class: "cp-rk-grid" },
        h("div", { class: "cp-rk-g" }, h("p", { class: "cp-label" }, "Each on its own"), t1),
        h("div", { class: "cp-rk-g" }, h("p", { class: "cp-label" }, "Claude against the ETF"), t2)),
      h("p", { class: "cp-src" }, `n = ${plural(n, "daily simple return")}, each from two consecutive sessions with both values.`,
        ...rfLine), how);
  }

  /* ---------------------------------------------------------------- Holdings tab */
  function setOpen(btn, det, open) {
    if (!det) return;
    btn.setAttribute("aria-expanded", String(open));
    btn.closest("tr").classList.toggle("open", open);
    if (open) { det.hidden = false; void det.offsetHeight; det.classList.add("in"); return; }
    det.classList.remove("in");
    if (still()) det.hidden = true;
    else setTimeout(() => { if (btn.getAttribute("aria-expanded") !== "true") det.hidden = true; }, 240);
  }
  /* the detail line under a thesis: each "·" part kept on one line */
  const metaLine = (parts) => h("p", { class: "cp-det-meta" }, parts.map((x, i) => [i ? " · " : null, h("span", { class: "nw" }, x)]));
  /* one table row with its company button; with a thesis, the button opens a detail row (Why Claude holds it, risks, meta).
     prefix keeps the detail rows' ids unique when two tables list the same tickers (Next orders and Holdings) */
  function holdRow(r, cells, meta, ncols, prefix) {
    const id = `${prefix}-${r.ticker}`;
    const expandable = !!(r.thesis || r.risks);
    const l1 = h("span", { class: "cp-co-l1" }, h("b", {}, r.ticker), h("span", { class: "nm" }, r.name || ""));
    const txt = h("span", { class: "cp-co-t" }, l1,
      expandable && r.thesis ? h("span", { class: "cp-co-th", "aria-hidden": "true" }, r.thesis) : null,
      !expandable && meta ? h("span", { class: "cp-co-meta" }, meta.join(" · ")) : null);
    const co = expandable
      ? h("button", {
        class: "cp-co cp-row-toggle", type: "button", "aria-expanded": "false", "aria-controls": id,
        "aria-label": `${r.ticker}, ${r.name || r.ticker}: thesis and risks`,
      }, txt, chev())
      : h("div", { class: "cp-co" }, txt);
    const tr = h("tr", { class: "cp-row" }, h("td", { class: "c-co" }, co), cells);
    if (!expandable) return [tr];
    const det = h("tr", { id, class: "cp-detail", hidden: true }, h("td", { colspan: ncols },
      h("div", { class: "cp-det-in" }, h("div", { class: "cp-det-clip" }, h("div", { class: "cp-det-body" },
        r.thesis ? h("div", {}, h("p", { class: "cp-label" }, "Why Claude holds it"), h("p", {}, r.thesis)) : null,
        r.risks ? h("div", {}, h("p", { class: "cp-label" }, "What could go wrong"), h("p", {}, r.risks)) : null,
        meta ? metaLine(meta) : null)))));
    co._det = det;
    co.addEventListener("click", () => setOpen(co, det, co.getAttribute("aria-expanded") !== "true"));
    return [tr, det];
  }
  const wbar = (w, cap, cls = "") => h("span", { class: "cp-wt" }, h("span", { class: "cp-bar cap", "aria-hidden": "true" },
    h("i", { class: cls || null, style: `width:${Math.max(0, Math.min(1, ok(cap) && cap > 0 ? w / cap : w)) * 100}%` })), wp(w));
  const gainCell = (g, gp) => h("span", { class: "cp-gain" }, tn(g, s$(g)), h("small", { class: tone(gp) || null }, sp(gp, fmt.p1)));
  /* the pending decision's orders. Before the first fills: Claude's first picks, every row new. Once live: only the rows
     that change (the decision's own new, closed and resized stocks; without it, any target off its current weight),
     with every target behind "Show all"; a decision that changes nothing says so in one line. u: the pending decision */
  function nextOrders(s, hd, u) {
    const p = s.pending, live = s.state === "live";
    const held = new Map(((hd && hd.rows) || []).map((r) => [r.ticker, r]));
    const tgt = new Set(p.targets.map((r) => r.ticker));
    const rows = [...p.targets.map((r) => ({ ...r, now: live ? (held.get(r.ticker) || {}).weight || 0 : null })),
      ...(live ? [...held.values()].filter((r) => !tgt.has(r.ticker)).map((r) => ({ ...r, now: r.weight, weight: 0, out: true })) : [])];
    const chg = (r) => (r.out ? "Out" : !live || !r.now ? "New"
      : Math.abs(r.weight - r.now) < 0.0005 ? "—" : `${sign((r.weight - r.now) * 100, fmt.n1)} pts`);
    const cols = live ? 4 : 3;
    const table = (list, prefix, caption) => {
      const body = list.flatMap((r) => holdRow(r, [live ? h("td", { class: "num c-now" }, wp(r.now)) : null,
        h("td", { class: "num c-gain" }, r.out ? "—" : wp(r.weight)), h("td", { class: "num c-chg c-wt" }, chg(r))], null, cols, prefix));
      return tableRoles(h("table", { class: "cp-tbl" }, h("caption", { class: "sr-only" }, caption),
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Company"), live ? h("th", { scope: "col", class: "num c-now" }, "Now") : null,
          h("th", { scope: "col", class: "num" }, "Target"), h("th", { scope: "col", class: "num" }, "Change"))),
        h("tbody", {}, body),
        h("tfoot", {}, h("tr", {}, h("td", { class: "c-co" }, h("b", {}, "Cash")), live ? h("td", { class: "num c-now" }, wp(s.cash_weight)) : null,
          h("td", { class: "num c-gain" }, wp(p.cash)), h("td", { class: "num c-x" }, "")))));
    };
    const td = tradeDay(p.decided_on);
    const bar = (sub, title) => h("div", { class: "cp-tbar" }, h("div", {}, h("h3", {}, title || (live ? "Next orders" : "Claude's first picks")),
      h("p", { class: "cp-sub" }, sub)));
    const sched = `Market-on-close orders are scheduled for ${wday(td)}, 20:15 Berlin, at the Interactive Brokers demo account.`;
    const card = (...kids) => h("div", { class: "cp-card cp-flush cp-next" }, ...kids);
    if (!live) return card(bar(`Decided on the ${dayShort(p.decided_on)} closes. ${sched}`), table(rows, "th-next", "Claude's first picks: target weights"));
    const trades = u ? new Set([...(u.new || []), ...(u.closed || []), ...(u.resized || [])].map((x) => x.ticker)) : null;
    const moving = rows.filter((r) => (trades ? trades.has(r.ticker) : chg(r) !== "—"));
    const all = more(`Show all ${plural(p.targets.length, "target")}`, table(rows, "th-tgt", "Next orders: every target weight"),
      { cls: "cp-next-all" });
    if (!moving.length) {
      return card(bar(`Decided on the ${dayShort(p.decided_on)} closes: nothing to trade. Next decision ${nextWhen(s.next_decision)}.`, "No orders"),
        h("p", { class: "cp-next-none" }, `No weight changes: all ${plural(p.targets.length, "holding")} are kept.`), all);
    }
    return card(bar(`Decided on the ${dayShort(p.decided_on)} closes. ${sched}`),
      table(moving, "th-next", "Next orders: the weights that change"), all);
  }
  function holdTable(s, hd, lim, sameSince) {
    const rows = hd.rows || [];
    const ncols = sameSince ? 5 : 6;
    const btn = h("button", { class: "cp-btn text", type: "button", "aria-expanded": "false" }, "Open all theses");
    const since = (cls) => (sameSince ? null : h("td", { class: cls }));
    const body = rows.flatMap((r) => holdRow(r, [
      h("td", { class: "c-sec" }, r.sector || "—"),
      h("td", { class: "c-wt" }, wbar(r.weight, lim.weight_max)),
      h("td", { class: "num c-val" }, m$(r.value)),
      h("td", { class: "num c-gain" }, gainCell(r.gain, r.gain_pct)),
      sameSince ? null : h("td", { class: "c-since" }, r.since ? dayShort(r.since) : "—")],
    [`${fmt.n0.format(r.shares)} shares`, `paid ${m$(r.paid)}`, `last price ${m$(r.price)}`, `held since ${r.since ? day(r.since) : "—"}`],
    ncols, "th-hold"));
    const total = s.value - s.capital;
    const tbl = h("table", { class: "cp-tbl cp-hold" }, h("caption", { class: "sr-only" }, "Holdings, sorted by weight"),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Company"), h("th", { scope: "col", class: "c-sec" }, "Sector"),
        h("th", { scope: "col", class: "c-wt" }, "Weight",
          ok(lim.weight_max) ? h("span", { class: "cp-th-note" }, `bar to the ${p0(lim.weight_max)} cap`) : null),
        h("th", { scope: "col", class: "num c-val" }, "Value"), h("th", { scope: "col", class: "num c-gain" }, "Gain"),
        sameSince ? null : h("th", { scope: "col", class: "c-since" }, "Since"))),
      h("tbody", {}, body),
      h("tfoot", {},
        h("tr", {}, h("td", { class: "c-co" }, h("div", { class: "cp-co" }, h("b", {}, "Cash"))), h("td", { class: "c-sec" }),
          h("td", { class: "c-wt" }, wbar(s.cash_weight, lim.cash_max, "hatch")), h("td", { class: "num c-val" }, m$(hd.cash)),
          h("td", { class: "num c-gain" }, h("span", { class: "sm-only" }, m$(hd.cash))), since("c-since")),
        h("tr", {}, h("td", { class: "c-co" }, h("div", { class: "cp-co" }, h("b", {}, "Total"))), h("td", { class: "c-sec" }),
          h("td", { class: "c-wt" }, h("span", { class: "cp-wt" }, "100%")), h("td", { class: "num c-val" }, m$(s.value)),
          h("td", { class: "num c-gain" }, h("span", { class: "cp-gain" }, h("span", { class: "sm-only" }, m$(s.value)), tn(total, s$(total)),
            h("small", { class: `lg-only ${tone(s.return)}` }, sp(s.return, fmt.p1)))), since("c-since"))));
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      tbl.querySelectorAll(".cp-row-toggle").forEach((b) => setOpen(b, b._det, open));
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? "Close all theses" : "Open all theses";
    });
    return h("div", { class: "cp-card cp-flush cp-holdc" }, h("div", { class: "cp-tbar" }, h("h3", {}, "Holdings"), btn), tableRoles(tbl));
  }
  function allocation(s, hd, lim) {
    const rows = s.state === "live" ? (hd && hd.rows) || [] : ((s.pending && s.pending.targets) || []);
    const count = {};
    rows.forEach((r) => { const k = r.sector || "Other"; count[k] = (count[k] || 0) + 1; });
    const cash = s.state === "live" ? s.cash_weight : s.pending ? s.pending.cash : 1;
    const secs = s.sectors || [];
    const top = Math.max(...secs.map((x) => x.weight), 0.0001);
    const ws = rows.map((r) => r.weight).filter(ok);
    const big = ws.length ? rows.find((r) => r.weight === Math.max(...ws)) : null;
    const small = ws.length ? rows.find((r) => r.weight === Math.min(...ws)) : null;
    const cm = ok(lim.cash_max) ? lim.cash_max : null;
    /* each figure next to its limit; one outside the limit (weights drift between decisions) is flagged, not hidden */
    const limit = (text, bad) => [text ? h("span", {}, ` (${text})`) : null, bad ? h("span", { class: "cp-flag" }, " · outside the limit") : null];
    const n = rows.length;
    const wtxt = (r) => (r ? `${r.ticker} ${wp(r.weight)}` : "—");
    const dl = h("dl", { class: "cp-rules-dl" },
      h("dt", {}, "Positions"), h("dd", {}, String(n),
        ...limit(lim.positions_min ? `rule: ${lim.positions_min} to ${lim.positions_max}` : "",
          lim.positions_min && (n < lim.positions_min || n > lim.positions_max))),
      h("dt", {}, "Largest"), h("dd", {}, wtxt(big), ...limit(ok(lim.weight_max) ? `cap ${p0(lim.weight_max)}` : "",
        big && ok(lim.weight_max) && big.weight > lim.weight_max + 0.0005)),
      h("dt", {}, "Smallest"), h("dd", {}, wtxt(small), ...limit(ok(lim.weight_min) ? `floor ${p0(lim.weight_min)}` : "",
        small && ok(lim.weight_min) && small.weight < lim.weight_min - 0.0005)),
      h("dt", {}, "Cash"), h("dd", {}, wp(cash), ...limit(cm != null ? `limit ${p0(cm)}` : "", cm != null && cash > cm + 0.0005)));
    const barLabel = `Invested ${wp(1 - cash)}, cash ${wp(cash)}${cm != null ? `; cash limit ${p0(cm)}` : ""}`;
    return h("div", { class: "cp-card cp-alloc" }, h("h3", {}, "Allocation"),
      h("div", { class: "cp-alloc-b a-bar" },
        h("div", { class: "cp-alloc-row" }, h("span", {}, "Invested ", h("b", {}, wp(1 - cash))), h("span", {}, "Cash ", h("b", {}, wp(cash)))),
        h("div", { class: "cp-alloc-bar", role: "img", "aria-label": barLabel },
          h("span", { class: "inv", style: `flex:${Math.max(0, 1 - cash)}` }), h("span", { class: "cash", style: `flex:${Math.max(0, cash)}` }),
          cm != null ? h("i", { class: "tick", style: `left:calc(${(1 - cm) * 100}% - 1px)` }) : null),
        cm != null ? h("div", { class: "cp-alloc-tl", "aria-hidden": "true" },
          h("span", { style: `left:${(1 - cm) * 100}%` }, `cash limit ${p0(cm)}`)) : null),
      h("div", { class: "cp-alloc-b a-sec" }, h("p", { class: "cp-label" }, "By sector"),
        secs.length ? h("ul", { class: "cp-sect" }, secs.map((x) => h("li", {}, h("span", { class: "n" }, x.sector),
          h("span", { class: "w" }, wp(x.weight)), h("span", { class: "c" }, plural(count[x.sector] || 0, "stock")),
          h("span", { class: "cp-bar", "aria-hidden": "true" }, h("i", { style: `width:${(x.weight / top) * 100}%` })))))
          : h("p", { class: "cp-sub" }, "No sectors yet.")),
      n ? h("div", { class: "cp-alloc-b a-lim" }, h("p", { class: "cp-label" }, "Rule limits, applied at each decision"), dl) : null);
  }
  function holdings(D) {
    const s = D.s, hd = D.hd;
    if (!s) return sec("holdings", secHead("Holdings", "holdings", "Holdings", null, null, 1), failed(D.err.s));
    const live = s.state === "live", lim = limitsOf(s);
    const rows = (hd && hd.rows) || [];
    const sameSince = rows.length > 0 && rows.every((r) => r.since && r.since === rows[0].since);
    const allThesis = rows.length > 0 && rows.every((r) => r.thesis);
    const title = live ? `${plural(s.positions, "stock")}${allThesis ? ", each with a written thesis" : ""}`
      : s.pending ? "Claude's picks, before the first fills" : "No holdings yet";
    const dek = live && hd ? `Weights at the last valuation, ${dayShort(hd.as_of || s.as_of)}. ` +
      `${sameSince ? `All ${plural(rows.length, "position")} have been held since ${dayShort(rows[0].since)}. ` : ""}` +
      "Open a row to read why Claude holds the stock and the risk it is watching."
      : s.pending ? "Target weights from Claude's first decision. Open a row to read why Claude picked the stock and the risk it is " +
        "watching." : null;
    const head = secHead("Holdings", "holdings", title, dek, null, 1);
    if (!live && !s.pending) return sec("holdings", head, framed(`Claude's first decision is due ${wday(s.next_decision)}.`));
    /* the holdings first, then the allocation, then the pending decision's orders; before the first fills the picks are
       the holdings, so they come first */
    const pend = (s.pending && D.up && (D.up.updates || []).find((u) => u.pending && u.date === s.pending.decided_on)) || null;
    const next = s.pending ? nextOrders(s, hd, pend) : null;
    const grid = live
      ? h("div", { class: "cp-hold-grid" }, hd ? holdTable(s, hd, lim, sameSince) : h("div", { class: "cp-card cp-holdc" }, failed(D.err.hd)),
        allocation(s, hd, lim), next)
      : h("div", { class: "cp-hold-grid" }, next, allocation(s, hd, lim));
    return sec("holdings", head, grid);
  }

  /* ---------------------------------------------------------------- Decisions tab */
  const pauseIc = () => h("span", { class: "pause", "aria-hidden": "true" });
  function statusChip(u) {
    if (u.filled_on) {
      return h("span", { class: "cp-chip ok" }, h("b", { "aria-hidden": "true" }, "✓"),
        u.venue ? "Traded at Interactive Brokers (demo)" : "Traded · simulated fill");
    }
    if (scheduled(u)) {
      return h("span", { class: "cp-chip sched" }, h("b", { "aria-hidden": "true" }, "◷"), `Orders scheduled ${wday(tradeDay(u.date))}`);
    }
    if (u.status === "ok") return h("span", { class: "cp-chip" }, pauseIc(), "Held · no orders");
    return h("span", { class: "cp-chip warn" }, h("b", { "aria-hidden": "true" }, "!"), "Rejected by the rules");
  }
  function stages(u) {
    const st = (cls, label, word) => h("li", { class: cls }, h("i", { "aria-hidden": "true" }), label,
      h("span", { class: "sr-only" }, ` (${word})`));
    const list = [st("done", "Decided", "done"), st(u.sha256 ? "done" : "", "Fingerprinted", u.sha256 ? "done" : "skipped")];
    if (u.status !== "ok" && !u.filled_on) list.push(st("rej", "Rejected", "rejected"));
    else {
      list.push(u.filled_on ? st("done", "Ordered", "done") : scheduled(u) ? st("sched", "Ordered", "scheduled") : st("", "No orders", "skipped"));
      list.push(st(u.filled_on ? "done" : "", "Filled and booked", u.filled_on ? "done" : "skipped"));
    }
    return h("ol", { class: "cp-stages", "aria-label": "Stages" }, list);
  }
  /* a decision made under an earlier rule set: said before Claude's note, whose figures follow those rules */
  function earlierRules(u, s) {
    const fp = `fingerprint ${u.rules_hash.slice(0, 12)}…`;
    const beforeFill = s.rules_fixed_on && (!u.filled_on || u.filled_on >= s.rules_fixed_on);
    return beforeFill
      ? `Made under the previous rule set (${fp}). Rules v${s.rules_version || 3} were fixed on ${day(s.rules_fixed_on)}, ` +
        "before this decision's orders were filled; figures in Claude's note refer to the earlier rules."
      : `Made under an earlier rule set (${fp}); figures in Claude's note refer to those rules.`;
  }
  /* a held decision whose weight changes were all under the minimum change: why there were no orders. Targets that
     only restate the current weights (under 0.1 point apart) say nothing; a deliberate small change is named, and so is
     one that would have brought a weight back inside a limit (a trim to the cap) */
  function skippedNote(u, s, names) {
    const sk = u.skipped_small || [];
    if (u.status !== "ok" || u.orders || scheduled(u) || u.filled_on || !sk.length) return null;
    const lim = limitsOf(s), mc = lim.min_change;
    const crosses = (x) => (ok(lim.weight_max) && x.from > lim.weight_max && x.to <= lim.weight_max)
      || (ok(lim.weight_min) && x.from < lim.weight_min && x.to >= lim.weight_min);
    const meant = sk.filter((x) => Math.abs(x.to - x.from) >= 0.001 || crosses(x));
    if (!meant.length) return null;
    const rule = ok(mc) ? `Weight changes under ${fmt.n0.format(mc * 100)} percentage point${mc === 0.01 ? "" : "s"} are not traded (rule)`
      : "Weight changes under the minimum are not traded (rule)";
    const shown = meant.filter((x) => wp(x.from) !== wp(x.to)).slice(0, 3)
      .map((x) => `${names[x.ticker] ? `${names[x.ticker]} (${x.ticker})` : x.ticker} ${wp(x.from)} → ${wp(x.to)}`);
    const placed = u.pending ? "places" : "placed";
    return h("p", { class: "cp-skipnote" }, shown.length ? `Not traded: ${shown.join(", ")}. ${rule}, so this decision ${placed} no orders.`
      : `${rule}; every change in this decision was smaller, so it ${placed} no orders.`);
  }
  function decisionCard(u, i, count, s, names) {
    const k = String(count - i).padStart(2, "0");
    const bd = u.decided_at && berlinDate(u.decided_at);
    const hid = `dec-h-${u.date}`;
    const rail = h("div", { class: "cp-rail" },
      h("h3", { class: "cp-rail-h", id: hid, tabindex: "-1" }, h("span", { class: "cp-eyebrow" }, `Decision ${k}`),
        h("span", { class: "sr-only" }, ", "), h("span", { class: "cp-rail-d" }, wday(bd || u.date))),
      h("p", { class: "cp-rail-c" }, `on the ${dayShort(u.date)} closes`), statusChip(u), stages(u));
    const body = h("div", { class: "cp-body" });
    const note = h("div", {}, h("p", { class: "cp-label" }, "Claude's note"));
    if (u.rules_hash && s && s.rules_hash && u.rules_hash !== s.rules_hash) note.append(h("p", { class: "cp-callout" }, earlierRules(u, s)));
    if (u.alert) {
      const qid = `dec-q-${u.date}`;
      const q = h("blockquote", { class: "cp-quote", id: qid }, `“${prose(u.alert)}”`);
      note.append(q);
      if (i > 0 && u.alert.length > 320) {
        q.classList.add("clamp");
        const t = h("button", { class: "cp-btn text", type: "button", "aria-expanded": "false", "aria-controls": qid }, "Read the full note");
        t.addEventListener("click", () => {
          const closed = q.classList.toggle("clamp");
          t.setAttribute("aria-expanded", String(!closed));
          t.textContent = closed ? "Read the full note" : "Show less";
        });
        note.append(t);
      }
    } else {
      note.append(h("p", { class: "cp-sub" }, u.status === "ok" ? "No note this time."
        : prose(u.reason) || "No readable answer this time; the portfolio stayed as it was."));
    }
    body.append(note);
    const groups = [];
    const chip = (g, cls, text, ...rest) => h("li", {}, g ? h("span", { class: `g ${cls}`, "aria-hidden": "true" }, g) : null, text, ...rest);
    const to = () => h("span", { class: "ar" }, " → ");
    if ((u.new || []).length) groups.push(["New positions", u.new.map((x) => chip("+", "up", `${x.ticker} ${wp(x.to)}`))]);
    if ((u.closed || []).length) groups.push(["Closed", u.closed.map((x) => chip(MINUS, "down", `${x.ticker} ${wp(x.from)}`, to(), "0"))]);
    if ((u.resized || []).length) groups.push(["Resized", u.resized.map((x) => chip(null, "", `${x.ticker} ${wp(x.from)}`, to(), wp(x.to)))]);
    if (groups.length) {
      const why = (u.new || []).filter((x) => x.thesis);
      body.append(h("div", {}, h("p", { class: "cp-label" }, "Changes"),
        groups.map(([label, items]) => h("div", { class: "cp-chg-g" }, h("p", {}, label), h("ul", { class: "cp-chgs" }, items))),
        why.length ? h("div", { style: "margin-top:12px" }, more(why.length === 1 ? "Why this one" : `Why these ${why.length}`,
          h("ul", { class: "cp-why" }, why.map((x) => h("li", {}, h("b", {}, x.ticker), `${wp(x.to)} · ${x.thesis}`))))) : null));
    } else if (u.status === "ok") body.append(h("p", { class: "cp-sub" }, `No changes · ${plural(u.unchanged || 0, "holding")} kept`));
    const skip = skippedNote(u, s, names);
    if (skip) body.append(skip);
    const disc = [];
    if (u.market_view) disc.push(more("Market view", prose(u.market_view)));
    if (u.self_review && u.self_review.trim().toLowerCase() !== "first decision") disc.push(more("Looking back", prose(u.self_review)));
    if ((u.repairs || []).length) {
      disc.push(more(`Rule fixes (${u.repairs.length})`, h("ul", {}, u.repairs.map((r) => h("li", {}, prose(r)))), { cls: "fix" }));
    }
    if (disc.length) body.append(h("div", { class: "cp-disc" }, disc));
    const fill = u.filled_on ? (u.venue ? `filled ${dayShort(u.filled_on)} at Interactive Brokers (demo) · ${plural(u.orders, "order")}`
      : `filled ${dayShort(u.filled_on)} · simulated at the Lang & Schwarz session end · ${plural(u.orders, "order")}`)
      : scheduled(u) ? `orders scheduled ${wday(tradeDay(u.date))}` : "no orders";
    body.append(h("div", { class: "cp-proof" },
      h("p", {}, u.decided_at ? h("span", {}, `decided ${utcStamp(u.decided_at)}`) : null,
        u.sha256 ? h("span", { class: "cp-hashrow" }, "SHA-256", hashRow(u.sha256, `decision ${k}`)) : null),
      h("p", {}, h("span", {}, fill), ok(u.searches) ? h("span", {}, `web searches: ${u.searches}`) : null, ext("history ↗"))));
    return h("li", { id: `decision-${u.date}`, class: "cp-card" }, h("article", { class: "cp-dec", "aria-labelledby": hid }, rail, body));
  }
  let DEC = null;                                // the decision list and its "Show all" button, for the chart's clicks
  function revealDecisions() {
    if (!DEC) return null;
    const hidden = [...DEC.list.querySelectorAll(":scope > li[hidden]")];
    hidden.forEach((li) => { li.hidden = false; });
    if (DEC.all) { DEC.all.remove(); DEC.all = null; }
    return hidden.length ? hidden[0].querySelector(".cp-rail-h") : null;
  }
  function decisions(D) {
    const ups = D.up ? D.up.updates || [] : null;
    const trades = ups ? ups.filter((u) => u.filled_on).length : 0;
    const orders = ups ? ups.reduce((a, u) => a + (u.filled_on ? u.orders || 0 : 0), 0) : 0;
    const head = secHead("Decisions", "decisions", "Every decision, in Claude's words",
      "Newest first. Each decision carries the time it was made, its fingerprint and the fills that followed.",
      ups && ups.length ? h("p", { class: "cp-sum" },
        `${plural(ups.length, "decision")} · ${trades} with trades · ${plural(orders, "order")} filled`) : null, 1);
    DEC = null;
    if (!ups) return sec("decisions", head, failed(D.err.up));
    if (!ups.length) return sec("decisions", head, framed("No decision yet.", D.s ? `The first one is due ${wday(D.s.next_decision)}.` : null));
    const names = {};
    ((D.hd && D.hd.rows) || []).forEach((r) => { if (r.name) names[r.ticker] = r.name; });
    ((D.s && D.s.pending && D.s.pending.targets) || []).forEach((r) => { if (r.name && !names[r.ticker]) names[r.ticker] = r.name; });
    /* the tab is the decisions: all of them show, up to 8; beyond that the newest 6 and a "Show all" button */
    const fold = ups.length > 8;
    const list = h("ol", { class: "cp-log" }, ups.map((u, i) => {
      const li = decisionCard(u, i, ups.length, D.s, names);
      if (fold && i >= 6) li.hidden = true;
      return li;
    }));
    const all = fold
      ? h("button", { class: "cp-btn wide-sm", type: "button", style: "margin-top:16px" }, `Show all ${ups.length} decisions`) : null;
    DEC = { list, all };
    if (all) {
      all.addEventListener("click", () => {
        const first = revealDecisions();
        if (first) first.focus();                 // the button is gone: focus goes to the first card it revealed
      });
    }
    return sec("decisions", head, list, all);
  }

  /* ---------------------------------------------------------------- How it works tab: the pipeline and the week */
  function method(D) {
    const s = D.s || {}, lim = limitsOf(s);
    const searches = ok(lim.web_searches_max) ? `may run up to ${lim.web_searches_max} web searches` : "may run a few web searches";
    const FLOW = [
      ["Brief", "The program condenses S&P 500 prices, trends and sector moves into a short list of candidates: momentum leaders, " +
        "pullbacks and dips.", "Python · Lang & Schwarz prices", "brief"],
      ["Claude decides", `Claude reads the brief, ${searches}, and sets a target weight for each stock with a thesis and its risks.`,
        "Claude Code, run headless · Wed evening, Sat morning", "targets"],
      ["Rules check", `The program checks the answer against Rules v${s.rules_version || 3}, fixes or rejects what breaks them, and ` +
        "publishes the decision with its SHA-256 fingerprint.", "before any order exists", "orders"],
      ["Orders", "Market-on-close orders go to an Interactive Brokers demo account on the next trading day and fill at the US " +
        "closing auction.", "Thu and Mon · 20:15 Berlin", "fills"],
      ["Booked", "The fills are read back and booked: same shares, same prices, the broker's commission. The portfolio is valued " +
        "after each session.", "fills 22:20 · valued ~23:00 Berlin", null],
    ];
    const fig = h("figure", { class: "cp-fig" },
      h("div", { class: "cp-groups", "aria-hidden": "true" }, h("span", { class: "g1" }, "Program"), h("span", { class: "g2" }, "Claude"),
        h("span", { class: "g3" }, "Program and broker")),
      h("ol", { class: "cp-flow" }, FLOW.map(([t, x, m, c], i) => h("li", { class: `cp-node n${i + 1}` },
        h("span", { class: "cp-node-disc", "aria-hidden": "true" }, String(i + 1)),
        h("div", { class: "cp-card cp-node-c" }, h("p", { class: "cp-node-n", "aria-hidden": "true" }, `0${i + 1}`), h("h3", {}, t),
          h("p", { class: "t" }, x), h("p", { class: "cp-node-m" }, m)),
        c ? h("span", { class: "cp-conn" }, h("span", { class: "sr-only" }, "Passes on: "), h("span", {}, c), arrowIc()) : null))),
      h("figcaption", {}, h("b", {}, "Fig. 1"), "— How a decision becomes a trade. Times are Berlin time. If the broker cannot be " +
        "reached, a fill is simulated at that day's Lang & Schwarz session end (mid ± 0.05%, $1 per order) and is marked as simulated."));
    /* the tab's own index: each part of How it works in one click (the links stay on this tab, at that part) */
    const idx = h("nav", { class: "cp-idx", "aria-label": "Parts of How it works" }, h("ul", {}, METHOD_PARTS.map(([id, t]) =>
      h("li", {}, h("a", { href: `#/cp?tab=method&sec=${id}` }, t)))));
    return sec("method", secHead("How it works", "method", "How a decision becomes a trade",
      "Five steps, twice a week. Claude sets the target weights and explains them; the program enforces the rules, talks to " +
      "the broker and keeps the record.", idx, 1),
    fig, h("p", { class: "cp-note cp-gapnote" }, "A Wednesday decision trades on Thursday and a Saturday decision on Monday, at the " +
      "US close. Prices move in between; that gap is part of the record."),
    week(s));
  }
  function week(s) {
    const V = "valued ~23:00", O = "orders 20:15", F = "fills 22:20";
    const W = [["Mon", [O, F, V]], ["Tue", [V]], ["Wed", [["Claude decides, evening"], V]], ["Thu", [O, F, V]], ["Fri", [V]],
      ["Sat", [["Claude decides, morning"]]], ["Sun", []]];
    const today = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" }).format(new Date());
    const nd = s.next_decision;
    const ndIn = nd && (Date.parse(nd) - Date.parse(todayBerlin())) / 86400000;
    const ndDay = nd && ndIn >= 0 && ndIn < 7 ? wdOf(nd) : null;
    return h("div", { class: "cp-card cp-weekc" }, h("h3", {}, "The week"),
      h("ol", { class: "cp-week" }, W.map(([d, evs]) => {
        const tags = [d === today ? h("span", { class: "tag" }, "today") : null,
          d === ndDay ? h("span", { class: "tag nx" }, "next decision") : null].filter(Boolean);
        return h("li", { class: `cp-day${d === today ? " today" : ""}${d === ndDay ? " next" : ""}` }, h("b", {}, d),
          tags.length ? h("span", { class: "tags" }, tags) : null,
          evs.length ? h("ul", {}, evs.map((e) => (Array.isArray(e) ? h("li", { class: "dec" }, e[0]) : h("li", {}, e))))
            : h("span", { class: "none" }, "—"));
      })),
      h("p", { class: "cp-cap" }, "Daily values use Lang & Schwarz indicative prices after the session. US closing auction: 16:00 New York."));
  }

  /* ---------------------------------------------------------------- How it works tab: verify */
  function verify(D) {
    const s = D.s || {}, ups = (D.up && D.up.updates) || [];
    const latest = ups[0];
    const step = (n, title, text, ev) => h("div", { class: "cp-card proof cp-step" }, h("p", { class: "cp-step-n" }, n), h("h3", {}, title),
      h("p", { class: "t" }, text), h("div", { class: "cp-ev" }, ev));
    const rulesEv = h("div", { class: "cp-ev" }, h("span", {}, "SHA-256"), hashRow(s.rules_hash, "the rules"));
    const fixed = day(s.rules_fixed_on || "") || "the start";
    const steps = h("div", { class: "cp-steps" },
      h("div", { class: "cp-card proof cp-step" }, h("p", { class: "cp-step-n" }, "01"), h("h3", {}, "The rules"),
        h("p", { class: "t" }, `Rules v${s.rules_version || 3} were fixed on ${fixed}, before the first trade. A change to any rule ` +
          "would produce a different fingerprint."), rulesEv),
      step("02", "Each decision", latest ? "Every decision is published with the time it was made and a SHA-256 fingerprint of its " +
        "date, its target weights and Claude's full answer, before its orders go out." : "The first decision will appear here.",
      latest ? [h("span", {}, `${utcStamp(latest.decided_at)}`), hashRow(latest.sha256, "the latest decision")] : [h("span", {}, "—")]),
      step("03", "Every version", "Each update of this site is a commit in its GitHub branch, so earlier versions, and the " +
        "fingerprints they showed, stay readable.",
      [h("a", { class: "cp-btn", href: HISTORY_URL, target: "_blank", rel: "noopener" }, "Open the version history ↗", newTab())]));
    const explain = h("div", { class: "cp-fpx" }, more("What is a fingerprint, and how do I check one?", [
      h("p", {}, "A SHA-256 fingerprint is a 64-character code computed from a piece of data. Changing even one character of " +
        "the data gives a completely different code."),
      h("p", {}, "The site computes each decision's fingerprint at every update from the exact text in decisions.json (the " +
        "decision's date, its target weights and Claude's full answer), and the rules' fingerprint from the rules' own text in " +
        "summary.json. Recompute them with the button below, or in a terminal with the downloaded file:"),
      h("pre", {}, h("code", {}, "jq -j '.updates[0].fingerprinted' decisions.json | shasum -a 256")),
      h("p", {}, "That shows the fingerprints match the published data. To check that a decision was not edited after the fact, " +
        "compare its fingerprint with the same decision in earlier versions of this site on GitHub."),
    ]));
    const orders = (u) => (u.filled_on ? `${u.orders} filled ${dayShort(u.filled_on)} · ${u.venue ? "IB demo" : "simulated"}`
      : scheduled(u) ? `scheduled ${wday(tradeDay(u.date))}` : "no orders");
    const checks = [];
    let table = null;
    if (ups.length) {
      const tbl = h("table", { class: "cp-tbl" }, h("caption", { class: "sr-only" }, "Decisions and their fingerprints"),
        h("thead", {}, h("tr", {}, ["Decision", "Decided (UTC)", "Fingerprint", "Orders"].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", {}, ups.map((u) => {
          const when = wday((u.decided_at && berlinDate(u.decided_at)) || u.date);
          const box = h("div", { class: "cp-fh" }, hashRow(u.sha256, `the decision of ${when}`));
          const cell = h("td", { class: "f-h" }, box);
          checks.push([u.fingerprinted, u.sha256, box]);
          return h("tr", {},
            h("td", { class: "f-d" }, when, h("span", { class: "ink3" }, `on the ${dayShort(u.date)} closes`)),
            h("td", { class: "f-t ink2" }, u.decided_at ? utcStamp(u.decided_at, false) : "—", h("span", { class: "sm-only" }, " UTC")),
            cell, h("td", { class: "f-o" }, orders(u)));
        })));
      if (s.rules_json && s.rules_hash) checks.push([s.rules_json, s.rules_hash, rulesEv]);
      const can = window.crypto && crypto.subtle && checks.some((c) => c[0]);
      const status = h("p", { class: "cp-sub", role: "status" },
        can ? "Recompute every fingerprint from the published data, here in your browser." : "");
      const btn = can ? h("button", { class: "cp-btn", type: "button" }, "Recompute in this browser") : null;
      /* the per-decision list is folded (the tab is long); recomputing opens it, so each match shows next to its row */
      const fold = more(`Show each decision's fingerprint (${ups.length})`, tableRoles(tbl), { cls: "cp-fpt-more" });
      if (btn) {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          fold.open = true;
          let good = 0, n = 0;
          for (const [text, want, where] of checks) {
            if (!text || !want) continue;
            n += 1;
            const got = await sha256(text);
            const same = got === want;
            good += same ? 1 : 0;
            where.querySelectorAll(".cp-match").forEach((x) => x.remove());
            where.append(h("span", { class: `cp-match ${same ? "yes" : "no"}` }, same ? "✓ recomputed, matches" : "✗ recomputed, differs"));
          }
          status.textContent = `${good} of ${n} fingerprints recomputed here match the published ones.`;
          btn.textContent = "Recomputed";
        });
      }
      table = h("div", { class: "cp-card cp-flush cp-fpt" },
        h("div", { class: "cp-tbar" }, h("div", {}, h("h3", {}, "Decisions and their fingerprints"), status), btn), fold);
    }
    const st = window.BussolaStatic;
    const built = st && st.index && st.index.built ? berlinStamp(st.index.built, true) : null;
    const files = [["summary", D.s], ["holdings", D.hd], ["decisions", D.up], ["curve", D.cv]];
    const data = h("div", { class: "cp-card cp-data-c" }, h("h3", {}, "Download the data"),
      h("p", { class: "cp-sub" }, `Data as of ${day(s.as_of || "") || "—"}, valued ~23:00 Berlin.${built ? ` Snapshot built ${built}.` : ""}`),
      h("div", { class: "cp-dl" }, files.map(([n, d]) => h("button", {
        class: "cp-btn mono", type: "button", disabled: d ? null : true, onclick: () => download(n, d, s.as_of),
      }, `${n}.json`))),
      h("p", { class: "cp-dl-note" }, "The same answers the site is built from. Paper money; no personal data."));
    return sec("verify", secHead("Verify", "verify", "Check the record yourself",
      "The rules, each decision and every published version of this site leave a trace that anyone can check."), steps, explain, table, data);
  }

  /* ---------------------------------------------------------------- How it works tab: rules, built by, legal */
  function rules(D, n) {
    const s = D.s;
    const head = secHead("Rules", "rules", s && s.rules_version ? `Rules v${s.rules_version}, fixed before the first trade` : "The rules",
      ["Claude decides within these limits. The program fixes or rejects any decision that breaks them; each fix is listed with " +
        "its decision, under ", h("a", { href: "#/cp?tab=decisions" }, "Decisions"), "."]);
    if (!s) return sec("rules", head, failed(D.err.s));
    const mc = limitsOf(s).min_change;
    const left = h("div", { class: "cp-card" },
      h("ol", { class: "cp-rules" }, (s.rules || []).map((r) => h("li", {}, h("span", {}, numberize(r))))),
      ok(mc) ? h("p", { class: "cp-rules-x" }, "Also applied at each decision: a held stock is traded only when its weight would " +
        `change by at least ${fmt.n0.format(mc * 100)} percentage point${mc === 0.01 ? "" : "s"}. Between decisions, weights move ` +
        "with prices.") : null,
      h("div", { class: "cp-rules-f" }, h("span", {}, "fingerprint"), hashRow(s.rules_hash, "the rules"),
        s.rules_fixed_on ? h("span", {}, `fixed ${day(s.rules_fixed_on)}`) : null));
    const item = (lead, text) => h("p", {}, h("b", {}, lead), " ", text);
    const short = n < 20 ? " Annualized statistics appear after 20 sessions." : "";
    const right = h("div", { class: "cp-card proof" }, h("h3", {}, "What this is, and what it is not"), h("div", { class: "cp-isnot" },
      item("Paper money.", "Orders go to an Interactive Brokers demo account. No real money is at risk."),
      item("Indicative prices.", "Daily values use Lang & Schwarz indications after the session; other venues can differ slightly."),
      item("A short record.", s.start
        ? `It started on ${day(s.start)}; ${plural(n, "session")} say${n === 1 ? "s" : ""} little about skill.${short}`
        : "It has not started yet; the first fills open the record."),
      item("Not advice, not affiliated.", "An educational project. Claude is used as a tool; this project is not affiliated with Anthropic.")));
    return sec("rules", head, h("div", { class: "cp-rgrid" }, left, right));
  }
  function about(D) {
    const who = author();
    const v = (D.s && D.s.rules_version) || 3;
    const P = [
      ["An AI agent on a schedule", "Claude Code runs headless twice a week, reads a brief of S&P 500 candidates and returns " +
        "target weights with a thesis and the risks for each stock."],
      ["A rules engine with fingerprints", `Every answer is checked against Rules v${v}, fixed or rejected, and published with a ` +
        "SHA-256 fingerprint before any order exists."],
      ["Broker execution", "Market-on-close orders on an Interactive Brokers demo account; the fills are read back and booked at the " +
        "broker's prices and commission."],
      ["Measurement", "A daily valuation on Lang & Schwarz prices against the S&P 500 ETF bought on the same days, with drawdown, " +
        "daily extremes, beta and, from 20 sessions, volatility, Sharpe ratio, alpha, tracking error " +
        "and information ratio."],
      ["Publishing with full history", "A static snapshot on GitHub Pages, rebuilt after each update; every published version stays " +
        "in the branch history."],
    ];
    const STACK = ["Python", "Claude Code, headless", "Interactive Brokers API", "Lang & Schwarz prices", "TradingView charts", "GitHub Pages"];
    const card = who.name ? h("div", { class: "cp-card proof cp-author" },
      h("p", { class: "cp-label" }, "Author"),
      /* the name is the profile link (one link, not a name and a button to the same page), and says where it goes */
      h("p", { class: "cp-name" }, who.url ? h("a", { href: who.url, rel: "author noopener", target: "_blank" }, who.name,
        h("span", { class: "cp-via" }, ` · ${profileSite(who.url)} ↗`), newTab()) : who.name),
      h("p", { class: "cp-role" }, "Designed, built and operated end to end: the brief, the agent run, the rules engine, the broker " +
        "connection, the valuation and this site."),
      h("div", { class: "cp-alinks" },
        extLink(REPO_URL, "Site repository ↗", "cp-btn"),
        extLink(HISTORY_URL, "Version history ↗", "cp-btn")),
      h("div", { class: "cp-stackw" }, h("p", { class: "cp-label" }, "Stack"),
        h("ul", { class: "cp-stack" }, STACK.map((x) => h("li", {}, x))))) : null;
    const pieces = h("div", { class: "cp-card" }, h("h3", {}, "What this shows"),
      h("dl", { class: "cp-pieces" }, P.map(([t, d]) => h("div", {}, h("dt", {}, t), h("dd", {}, d)))));
    return sec("about", secHead("Built by", "about", "A one-person project, built with Claude Code",
      "An AI agent, a rules engine, a broker connection and a public record, designed, built and operated end to end."),
    h("div", { class: `cp-about${card ? "" : " solo"}` }, card, pieces));
  }
  function legal(D) {
    const s = D.s || {};
    return h("section", { class: "cp-legal", "data-sec": "legal", "aria-labelledby": "h-legal" }, h("div", { class: "cp-wrap" }, h("div", {},
      h("h2", { id: "h-legal", tabindex: "-1" }, "Legal and sources"),
      h("div", { class: "cp-legal-b" }, h("p", {}, h("strong", {}, "Paper money · educational · not investment advice")), h("p", {}, LEGAL),
        h("p", {}, `Benchmark: ${s.bench_name || "S&P 500 ETF"}. Charts: TradingView Lightweight Charts. Version history: `, ext("GitHub ↗")),
        h("p", {}, "Rules fingerprint: ", hashRow(s.rules_hash, "the rules"))))));
  }

  /* ---------------------------------------------------------------- loading state */
  function loading(tab) {
    const bar = (w, ht = 14) => h("span", { class: "cp-skel line", style: `width:${w};height:${ht}px` });
    const body = tab === "overview" ? [
      h("section", { class: "cp-hero" }, h("div", { class: "cp-wrap cp-hero-in" },
        h("div", {}, bar("38%", 13), bar("62%", 52), bar("92%", 22), bar("80%", 22), bar("70%", 18)),
        h("div", { class: "cp-skel", style: "height:300px" }))),
      h("div", { class: "cp-wrap" }, h("div", { class: "cp-skel", style: "height:470px;margin-top:72px" }))]
      : [h("div", { class: "cp-wrap cp-skel-tab" }, bar("14%", 13), bar("52%", 34), bar("66%", 18),
        h("div", { class: "cp-skel", style: "height:520px;margin-top:28px" }))];
    return h("div", { class: "cp", "aria-busy": "true" }, h("p", { class: "sr-only", role: "status" }, "Loading the portfolio…"), body);
  }

  /* ---------------------------------------------------------------- tabs
     The header's #cp-nav links (and every other #/cp link: the logo, the hero links, "Legal") switch tabs here, without
     loading anything. The address names the tab, so a reload opens the same tab, at its top; the plain link (#/cp) is
     Overview. A link to a section (?sec=<id>) opens the tab that holds it, at that section. The header's tabs and the
     logo rewrite the address (replaceState: no history entry per click); a link in the page (hero, chart marker, Legal,
     "Next") adds one (pushState), so Back returns to where the visitor was, at the same scroll position. */
  const T = { panels: null, cur: null, want: null, scoreOut: false };
  /* the one-line disclaimer above every tab. The public page has its own band (#pub-disclaimer, written by publish.py);
     the local app gets the same markup here, so both show the line at the top of every tab */
  const band = () => ($("pub-disclaimer") ? null : h("div", { class: "pub-disclaimer", role: "note", "aria-label": "Disclaimer" },
    h("p", {}, `${DISCLAIMER} `, h("span", { class: "nw" }, "· ", h("a", { href: "#/cp?tab=method&sec=legal" }, "Legal")))));
  /* the end of a tab: one link on to the next tab */
  const nextTab = (tab) => {
    const t = TABS.find((x) => x[0] === tab);
    return h("div", { class: "cp-wrap" }, h("p", { class: "cp-onward" },
      h("a", { href: tabUrl(tab) }, h("span", { class: "k" }, "Next"), h("span", {}, t[1], h("span", { class: "ar", "aria-hidden": "true" }, " →")))));
  };
  function tabOf(params) {
    const t = params.get("tab");
    if (TAB_IDS.has(t)) return t;
    return SEC_TAB[params.get("sec") || params.get("open")] || "overview";
  }
  const tabUrl = (tab) => (tab === "overview" ? "#/cp" : `#/cp?tab=${tab}`);
  function markNav(tab) {
    document.querySelectorAll("#cp-nav a[data-tab]").forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  function tabTitle(tab) {
    const who = author();
    const base = who.name ? `Claude Portfolio · by ${who.name}` : "Claude Portfolio";
    const t = TABS.find((x) => x[0] === tab);
    document.title = t && tab !== "overview" ? `${t[1]} · ${base}` : base;
  }
  /* the small Claude-against-the-ETF line in the header: on every tab but Overview, where the scoreboard says the same
     thing until it is scrolled past (gone under the header). Measured on each scroll and tab switch */
  function scorePast() {
    const sc = $("cp-score");
    if (!sc || !sc.getClientRects().length) return false;
    const top = document.querySelector("header.top");       // one row or two (below 900px): its real bottom edge
    return sc.getBoundingClientRect().bottom <= (top ? top.getBoundingClientRect().bottom : 64);
  }
  function syncMini() {
    const mn = $("cp-mini");
    if (!mn) return;
    const on = !mn.hidden && !!T.cur && (T.cur !== "overview" || T.scoreOut);
    mn.classList.toggle("on", on);
    document.body.classList.toggle("mini-on", on);
  }
  /* show one tab. sec: a section of it to open at; target: an element of it (a decision card); y: a scroll position to
     return to (Back). Otherwise the tab opens at its top. push: a link in the page, which gets a history entry (the
     current one keeps its scroll position for Back). focus: false on the first render only; a switch moves focus to the
     tab's heading (or the section's) */
  function showTab(tab, { sec = null, target = null, y = null, push = false, focus = true } = {}) {
    if (!T.panels || !T.panels[tab]) return;
    const panel = T.panels[tab];
    const prev = T.cur;
    const url = tabUrl(tab);
    if (location.hash !== url) {
      const to = `${location.pathname}${location.search}${url}`;
      if (push && prev) {
        try { history.replaceState({ ...(history.state || {}), cpY: Math.round(window.scrollY) }, ""); } catch (_) { /* no state */ }
        history.pushState(null, "", to);
      } else history.replaceState(null, "", to);
    }
    Object.entries(T.panels).forEach(([k, p]) => { p.hidden = k !== tab; });
    T.cur = tab;
    document.body.dataset.cpTab = tab;             // the header's phone layout differs on Overview (cp.css)
    markNav(tab);
    tabTitle(tab);
    if (prev && prev !== tab && !still()) {        // a short fade, nothing more (none at all with reduced motion)
      panel.classList.remove("cp-fade");
      void panel.offsetWidth;
      panel.classList.add("cp-fade");
    }
    if (tab === "overview" && prev !== "overview") drawChart();   // a hidden tab has no width: drawn at its real size
    const el = target || (sec ? panel.querySelector(`[data-sec="${CSS.escape(sec)}"]`) : null);
    const first = panel.firstElementChild;
    syncMini();                                    // first: on a phone the small scoreboard's band adds to the header's height
    /* a section lands with its heading block just under the sticky header (not its padded box, which starts a section
       gap higher); a decision card lands with its own top there */
    if (y != null) window.scrollTo(0, y);
    else if (el && el !== first) (el.matches(".cp-sec, .cp-legal") ? el.querySelector(".cp-head, h2") || el : el).scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
    if (tab === "overview") T.scoreOut = scorePast();
    syncMini();
    if (!focus) return;
    const hd = el && el !== first ? el.querySelector(".cp-rail-h, h1, h2") : panel.querySelector("h1, h2");
    if (hd) hd.focus({ preventScroll: true });
  }
  /* a chart marker: the Decisions tab, at that decision (unfolded first if it was under "Show all") */
  function openDecision(date) {
    const li = document.getElementById(`decision-${date}`);
    if (li && li.hidden) revealDecisions();
    showTab("decisions", { target: li || null, push: true });
  }
  const W = { obs: [], off: [] };                  // what render() wires up, undone by leave()
  function listen(target, type, fn, opt) {
    target.addEventListener(type, fn, opt);
    W.off.push(() => target.removeEventListener(type, fn, opt));
  }
  function onAnchor(e) {
    const a = e.target.closest && e.target.closest('a[href^="#/cp"]');
    if (!a || !T.panels || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const q = new URLSearchParams(a.getAttribute("href").split("?")[1] || "");
    e.preventDefault();
    showTab(tabOf(q), { sec: q.get("sec") || q.get("open"), push: !a.closest("#cp-nav, a.logo") });
  }
  function wire() {
    listen(document, "click", onAnchor);
    const onScroll = () => {
      document.body.classList.toggle("scrolled", window.scrollY > 8);
      if (T.cur !== "overview") return;            // a hidden scoreboard is never "scrolled past"
      const past = scorePast();
      if (past !== T.scoreOut) { T.scoreOut = past; syncMini(); }
    };
    listen(window, "scroll", onScroll, { passive: true });
    onScroll();
    /* the chart drops its title tags and marker labels below NARROW_CHART: redraw when a resize or rotation crosses it */
    if (CH && CH.plot && "ResizeObserver" in window) {
      let t = null;
      const ro = new ResizeObserver(() => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (CH && CH.chart && CH.plot.clientWidth > 0 && (CH.plot.clientWidth < NARROW_CHART) !== CH.narrow) drawChart();
        }, 200);
      });
      ro.observe(CH.plot);
      W.obs.push(ro);
    }
  }
  function themeToggle() {
    const b = $("theme-toggle");
    if (!b) return;
    const isLight = () => (document.documentElement.dataset.theme || "dark") === "light";
    const label = () => b.setAttribute("aria-label", isLight() ? "Switch to dark theme" : "Switch to light theme");
    label();
    if (b.dataset.bound) return;
    b.dataset.bound = "1";
    b.addEventListener("click", () => {
      const next = isLight() ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("cp-theme", next); } catch (_) { /* private window: this visit only */ }
      label();
      if (Router.current === "cp") drawChart();    // on another tab the chart is redrawn when Overview is shown again
    });
  }

  Pages.cp = {
    title: "Claude Portfolio",
    async render(el, params) {
      themeToggle();
      T.want = null;
      markNav(tabOf(params));
      el.replaceChildren(...[band(), loading(tabOf(params))].filter(Boolean));
      const keys = ["s", "hd", "up", "cv"];
      const got = await Promise.allSettled(["/api/cp/summary", "/api/cp/holdings", "/api/cp/updates", "/api/cp/curve"].map((p) => api(p)));
      if (!el.isConnected || Router.current !== "cp") return;
      const D = { err: {} };
      got.forEach((r, i) => {
        D[keys[i]] = r.status === "fulfilled" ? r.value : null;
        if (r.status !== "fulfilled") D.err[keys[i]] = r.reason;
      });
      const n = D.cv ? (D.cv.points || []).length : 0;
      statusPill(D.s);
      mini(D.s);
      const panel = (id, ...kids) => h("div", { class: "cp-panel", id: `cp-tab-${id}`, "data-panel": id, hidden: true }, ...kids);
      const P = {
        overview: panel("overview", hero(D), record(D), nextTab("holdings")),
        holdings: panel("holdings", holdings(D), nextTab("decisions")),
        decisions: panel("decisions", decisions(D), nextTab("method")),
        method: panel("method", method(D), rules(D, n), verify(D), about(D), legal(D)),
      };
      el.replaceChildren(...[band(), h("div", { class: "cp" }, Object.values(P),
        h("p", { class: "sr-only", id: "cp-announce", "aria-live": "polite" }))].filter(Boolean));
      T.panels = P;
      T.cur = null;
      wire();
      const q = T.want || params;                  // the address changed while the data loaded: that tab
      T.want = null;
      showTab(tabOf(q), { sec: q.get("sec") || q.get("open"), focus: false });
    },
    /* the router calls this when only the part after #/cp? changes (a typed address, a key): switch, do not reload */
    update(params) {
      if (!T.panels) { T.want = params; return true; }   // still loading: render() opens that tab when it is done
      const st = history.state;                    // Back or Forward to an entry that kept its scroll position
      showTab(tabOf(params), { sec: params.get("sec") || params.get("open"), y: st && Number.isFinite(st.cpY) ? st.cpY : null });
      return true;
    },
    leave() {
      W.obs.forEach((o) => o.disconnect());
      W.off.forEach((f) => f());
      W.obs = [];
      W.off = [];
      document.body.classList.remove("mini-on");
      delete document.body.dataset.cpTab;
      if (CH && CH.chart) dropChart(CH.chart);
      CH = null;
      DEC = null;
      T.panels = null;
      T.cur = null;
      T.want = null;
      T.scoreOut = false;
      markNav(null);
    },
  };
})();
