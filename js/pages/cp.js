/* Claude Portfolio (#/cp), the whole site: a rule-bound paper portfolio of S&P 500 stocks whose target weights Claude
   sets twice a week; an Interactive Brokers demo account executes them; every decision is fingerprinted before it trades.
   15 Nov 2026: ONE page, a dashboard of panels in view at a glance (the owner's request: "one single page, a different
   colour, nobody clicks through pages", after the idea of Trade Republic's web Trading screen). Styles: css/cp.css.
     top bar (index.html's header)   the mark, title, byline, links to How it works and Verify, the key numbers as pills,
                                     the status pill
     row 1                           Portfolio · Performance (the chart) · Holdings
     row 2                           Risk vs S&P 500 ETF · Decisions · Allocation and Recent fills
   How it works, Verify, Track record, Rules v3 and Legal open as dialogs, one at a time (#/cp?open=how, verify, track,
   rules, legal: the top bar's three links, the footer's five, the disclaimer's Legal, the Portfolio panel's count of
   holdings ahead of the ETF; the owner, 15 Nov 2026: How it works and Verify "must exist, but not be visible directly").
   #/cp is the only address: old links with ?tab=, ?sec= or ?open= open the page at its top (core.js Router drops them on
   arrival; render() cleans what is left).
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
  /* the author line when the page has none: publish.py writes the public one (meta name=author, link rel=author) from
     data/publish/config.json "author"; the local app has no such tags. Keep the two in step. */
  const AUTHOR = { name: "Vincenzo Silvestri", url: "https://www.linkedin.com/in/vincenzopiosilvestri" };
  /* the one-line disclaimer (publish.py DISCLAIMER_LINE says the same on the public site) and the full legal text */
  const DISCLAIMER = "Paper money · educational · not investment advice · not affiliated with Anthropic; Claude is used as a tool";
  const LEGAL = "Paper money only: an educational experiment, not a financial service and not investment advice, not a " +
    "recommendation or solicitation to buy or sell any security. Past or simulated results do not predict future results. " +
    "Not affiliated with Anthropic; Claude is used as a tool. Prices: Lang & Schwarz indications, for personal use. " +
    "Member list: Wikipedia (CC BY-SA 4.0).";
  /* the five dialogs a link can open. The same hrefs are written in index.html (the top bar's How it works, Verify and
     Track record, the local footer) and in publish.py (LEGAL_HREF, RULES_HREF, HOW_HREF, VERIFY_HREF, TRACK_HREF: the
     public band and footer) */
  const LEGAL_HREF = "#/cp?open=legal";
  const RULES_HREF = "#/cp?open=rules";
  const HOW_HREF = "#/cp?open=how";
  const VERIFY_HREF = "#/cp?open=verify";
  const TRACK_HREF = "#/cp?open=track";
  const DIALOGS = new Set(["legal", "rules", "how", "verify", "track"]);
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NARROW_CHART = 520;                      // below this plot width: smaller markers
  const DEC_SHOWN = 7;                           // decisions listed before "Show all" (all of them up to two more)

  /* ---------------------------------------------------------------- formatting */
  const m$ = (x) => (ok(x) ? unsigned(x, usd) : "—");
  const s$ = (x) => (ok(x) ? sign(x, usd) : "—");
  const sp = (x, f = fmt.p2) => (ok(x) ? sign(x, f) : "—");
  const wp = (x) => (ok(x) ? unsigned(x, fmt.p1) : "—");
  const p0 = (x) => (ok(x) ? fmt.p0.format(x) : "—");
  const tn = (x, text) => h("span", { class: ok(x) ? tone(x) || null : null }, text);
  const gapPts = (a, b) => (ok(a) && ok(b) ? (a - b) * 100 : null);
  const ptsTxt = (d, f = fmt.n2) => (ok(d) ? `${sign(d, f)} pts` : "—");
  const sp1 = (x) => sp(x, fmt.p1);
  const wdOf = (s) => WD[new Date(`${s.slice(0, 10)}T12:00:00Z`).getUTCDay()];
  const wday = (s) => (s ? `${wdOf(s)} ${dayShort(s)}` : "—");
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

  /* ---------------------------------------------------------------- small parts */
  const ic = (w, ...kids) => h("svg", { viewBox: "0 0 16 16", width: w, height: w, fill: "none", "aria-hidden": "true" }, ...kids);
  const stroke = { stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" };
  const chev = () => h("svg", { class: "cp-chev", viewBox: "0 0 12 12", width: 12, height: 12, fill: "none", "aria-hidden": "true" },
    h("path", { d: "M4.5 2.5 8 6l-3.5 3.5", ...stroke }));
  const copyIc = () => h("svg", { class: "i-copy", viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": "true" },
    h("rect", { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.6, ...stroke }),
    h("path", { d: "M10.5 3.4v-.3a1.6 1.6 0 0 0-1.6-1.6H4.1a1.6 1.6 0 0 0-1.6 1.6v4.8a1.6 1.6 0 0 0 1.6 1.6h.3", ...stroke }));
  const checkIc = () => h("svg", { class: "i-check", viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": "true" },
    h("path", { d: "M3 8.5 6.5 12 13 4.5", ...stroke }));
  const lockIc = () => ic(12, h("rect", { x: 3.5, y: 7.2, width: 9, height: 6.3, rx: 1.3, ...stroke }),
    h("path", { d: "M5.5 7.2V5.4a2.5 2.5 0 0 1 5 0v1.8", ...stroke }));
  const xIc = () => ic(16, h("path", { d: "M4 4l8 8M12 4l-8 8", ...stroke }));
  const newTab = () => h("span", { class: "sr-only" }, " (opens in a new tab)");
  const extLink = (href, text, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls || null }, text, newTab());
  /* a polite message for screen readers. While a dialog is open the page around it is inert and its live region silent:
     the open dialog's own region (makeDialog) speaks instead */
  const announce = (msg) => {
    const a = document.querySelector(".cp-dialog[open] .cp-dlg-live") || $("cp-announce");
    if (a) { a.textContent = ""; setTimeout(() => { a.textContent = msg; }, 30); }
  };
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* no clipboard API here: the old way */ }
    try {
      const ta = h("textarea", { class: "cp-clip", readonly: true, "aria-hidden": "true", tabindex: "-1" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      const done = document.execCommand("copy");
      ta.remove();
      return done;
    } catch (_) { return false; }
  }
  /* a fingerprint shortened on screen (the full one in the title and on the clipboard), with a copy button named after
     what it fingerprints. long: its start and its end, else its first 8 characters */
  function fingerprint(full, what, { long = false } = {}) {
    if (!full) return h("span", { class: "cp-na" }, "—");
    const code = h("code", { class: "cp-hash", title: full }, long ? `${full.slice(0, 12)}…${full.slice(-10)}` : `${full.slice(0, 8)}…`);
    const b = h("button", {
      class: "cp-copy", type: "button", title: "Copy the full fingerprint",
      "aria-label": `Copy the full fingerprint${what ? ` of ${what}` : ""}`,
    }, copyIc(), checkIc());
    b.addEventListener("click", async (e) => {
      e.stopPropagation();                       // a copy in a decision's row does not open the row
      const done = await copyText(full);
      b.classList.toggle("done", done);
      if (!done) {                               // no clipboard here: the whole fingerprint, selected, to copy by hand
        code.textContent = full;
        code.classList.add("full");
        const r = document.createRange();
        r.selectNodeContents(code);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      announce(done ? "Fingerprint copied" : "The fingerprint is selected: copy it with Ctrl+C or Command+C");
      clearTimeout(b._t);
      b._t = setTimeout(() => b.classList.remove("done"), 1600);
    });
    return h("span", { class: "cp-fp" }, code, b);
  }
  /* a panel: a small header row (a status dot and a grey label), the bold title (h2), tools at its right, then the body.
     dot: "ok" (green: current data), "wait" (grey: not started yet, or measures still gated), "bad" (red: did not load) */
  function panel(area, { label, dot = "ok", title, tools = null }, ...body) {
    const hid = `h-${area}`;
    return h("section", { class: `cp-panel p-${area}`, id: `cp-${area}`, "aria-labelledby": hid },
      h("header", { class: "cp-ph" },
        h("div", { class: "cp-ph-t" },
          h("p", { class: "cp-label" }, h("i", { class: `cp-dot ${dot}`, "aria-hidden": "true" }), h("span", {}, label)),
          h("h2", { id: hid }, title)),
        tools ? h("div", { class: "cp-tools" }, tools) : null),
      ...body);
  }
  const note = (msg, sub) => h("div", { class: "cp-empty" }, h("p", {}, msg), sub ? h("p", { class: "sub" }, sub) : null);
  const failed = (e) => note("This part could not load.", `${(e && e.message) || "No answer"}. The rest of the page is unaffected.`);
  /* a segmented control (the selected part a lighter pill): items [[id, label, words for screen readers]] */
  function seg(label, items, active, onpick) {
    const el = h("div", { class: "cp-seg", role: "group", "aria-label": label });
    for (const [id, text, sr] of items) {
      el.append(h("button", {
        type: "button", "aria-pressed": String(id === active),
        onclick: (e) => {
          el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
          onpick(id);
        },
      }, text, sr ? h("span", { class: "sr-only" }, sr) : null));
    }
    return el;
  }
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
  let counted = false;                          // the portfolio value counts once per page load
  function countUp(el, from, to) {
    if (counted || still() || !ok(from) || !ok(to)) { el.textContent = m$(to); return; }
    counted = true;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - (1 - k) ** 3;
      el.textContent = m$(from + (to - from) * e);
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
      else el.textContent = m$(to);
    };
    el.textContent = m$(from);
    requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------------- top bar: byline, pills, status */
  /* the status pill's words. w1 is the short form; the full line is the label and the tooltip */
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
    /* the word "decision" can go where the bar is short (phones): " · next Wed 18 Nov" */
    const parts = rest.split(/(decision )/).map((x) => (x === "decision " ? h("span", { class: "lg" }, x) : x));
    el.replaceChildren(h("i", { "aria-hidden": "true" }), h("span", { class: "w1" }, w1), h("span", { class: "rest" }, parts));
  }
  /* "by Vincenzo Silvestri" in the top bar, linked to the author's profile (a new tab) */
  function byline() {
    const el = $("cp-by");
    if (!el) return;
    const who = author();
    el.replaceChildren(...(who.name ? [h("span", { class: "cp-sep", "aria-hidden": "true" }, " · "), "by ",
      who.url ? h("a", { href: who.url, rel: "author noopener", target: "_blank" }, who.name, newTab()) : who.name] : []));
  }
  /* the account pills: the value with its change since the start, the S&P 500 ETF's return, the gap in points */
  function topPills(s) {
    const el = $("cp-pills");
    if (!el) return;
    if (!s || s.state !== "live") { el.hidden = true; el.replaceChildren(); return; }
    const d = gapPts(s.return, s.bench_return);
    const since = () => h("span", { class: "sr-only" }, ` since ${day(s.start)}`);
    el.replaceChildren(
      h("div", { class: "cp-pill" }, h("span", { class: "k" }, "Portfolio"), h("b", {}, m$(s.value)),
        h("span", { class: `d ${tone(s.return)}` }, sp(s.return)), since()),
      h("div", { class: "cp-pill" }, h("span", { class: "k" }, "S&P 500 ETF"), h("b", { class: tone(s.bench_return) || null }, sp(s.bench_return)),
        since()),
      h("div", { class: "cp-pill", title: "Claude minus the S&P 500 ETF, in percentage points" }, h("span", { class: "k" }, "Gap"),
        h("b", { class: tone(d) || null }, ptsTxt(d)), h("span", { class: "sr-only" }, ", Claude minus the ETF")));
    el.hidden = false;
  }

  /* ---------------------------------------------------------------- Portfolio */
  /* the holdings against the S&P 500 ETF, each since it was bought (cp_api since_bought, 17 Nov 2026): how many are
     ahead, then one segment per holding, largest first, azure when ahead and grey when not (a count, not a signed number:
     no green or red). Nothing without those figures (an app not restarted since). The count is a link to Track record,
     every trade against the ETF (17 Nov 2026) */
  function aheadStrip(D) {
    const rows = ((D.hd && D.hd.rows) || []).filter((r) => r.since_bought && ok(r.since_bought.return) && ok(r.since_bought.etf));
    if (rows.length < 2) return null;
    const isAhead = (r) => r.since_bought.return > r.since_bought.etf;
    const n = rows.filter(isAhead).length;
    const fig = (r) => `${r.ticker} ${sp1(r.since_bought.return)}, ETF ${sp1(r.since_bought.etf)}`;
    return h("div", { class: "cp-ahead" },
      /* "holdings" goes where the panel is narrowest (1200-1439px), so the line stays one line there too */
      h("p", {}, h("a", { href: TRACK_HREF, "aria-haspopup": "dialog", title: "Track record: every trade against the S&P 500 ETF" },
        h("b", {}, `${n} of ${rows.length}`), h("span", { class: "lg" }, " holdings"), " ahead of the ETF since bought")),
      h("div", { class: "cp-ahead-bar", role: "img",
        "aria-label": `${n} of ${rows.length} holdings ahead of the S&P 500 ETF, each since it was bought. Ahead: ` +
          `${rows.filter(isAhead).map((r) => r.ticker).join(", ") || "none"}.` },
      rows.map((r) => h("i", { class: isAhead(r) ? "on" : null, title: fig(r) }))));
  }
  function portPanel(D) {
    const s = D.s;
    const title = "Portfolio";
    if (!s) return panel("port", { label: "Claude Portfolio · paper", dot: "bad", title }, failed(D.err.s));
    const live = s.state === "live", lim = limitsOf(s);
    const n = D.cv ? (D.cv.points || []).length : null;
    const st = window.BussolaStatic;
    const built = st && st.index && st.index.built ? berlinStamp(st.index.built) : null;
    const kv = (k, v, sub) => h("div", { class: "cp-kv" }, h("dt", {}, k), h("dd", {}, h("b", {}, v), sub ? h("span", {}, sub) : null));
    const range = lim.positions_min ? `rule: ${lim.positions_min} to ${lim.positions_max}` : null;
    let top, cells;
    if (live) {
      const vis = h("span", { "aria-hidden": "true" }, m$(s.value));
      countUp(vis, s.capital, s.value);
      const gain = ok(s.value) ? s.value - s.capital : null;
      const d = gapPts(s.return, s.bench_return);
      top = [
        h("p", { class: "cp-big" }, vis, h("span", { class: "sr-only" }, m$(s.value))),
        h("p", { class: "cp-chg" }, tn(s.return, `${arrow(s.return)} ${s$(gain)} · ${sp(s.return)}`),
          // no-break spaces: on a short line the date moves down whole, never "since 19 / Oct"; the space before it can break
          h("span", { class: "cp-since" }, ` since\u00a0${dayShort(s.start).replace(/ /g, "\u00a0")}`)),
        h("p", { class: "cp-vs" }, "S&P 500 ETF ", h("b", { class: tone(s.bench_return) || null }, sp(s.bench_return)),
          h("span", { class: "cp-sep", "aria-hidden": "true" }, " · "), "gap ", h("b", { class: tone(d) || null }, ptsTxt(d))),
      ];
      cells = [
        kv("Cash", wp(s.cash_weight), ok(lim.cash_max) ? `limit ${p0(lim.cash_max)}` : null),
        kv("Positions", String(s.positions), range),
        kv("Started", day(s.start), n ? plural(n, "session") : null),
        kv("Valued", day(s.as_of), "~23:00 Berlin"),
      ];
    } else {
      const td = s.pending ? tradeDay(s.pending.decided_on) : null;
      top = [h("p", { class: "cp-big" }, m$(s.capital).replace(/\.00$/, "")),
        h("p", { class: "cp-chg cp-since" }, "paper money, not invested yet")];
      cells = [
        kv("Cash", "100%", ok(lim.cash_max) ? `limit ${p0(lim.cash_max)}` : null),
        s.pending ? kv("Picks", String(s.pending.names), range) : kv("Positions", "0", range),
        kv("First orders", td ? wday(td) : "—", td ? "20:15 Berlin, market-on-close" : null),
        kv("Next decision", nextWhen(s.next_decision), s.next_decision ? partOfDay(s.next_decision) : null),
      ];
    }
    return panel("port", { label: "Claude Portfolio · paper money", dot: live ? "ok" : "wait", title },
      h("div", { class: "cp-pb" }, h("div", { class: "cp-port-top" }, top), live ? aheadStrip(D) : null, h("dl", { class: "cp-kvs" }, cells),
        h("p", { class: "cp-foot" }, `Lang & Schwarz indicative prices${built ? ` · snapshot ${built}` : ""}`)));
  }

  /* ---------------------------------------------------------------- Performance: the chart */
  let CH = null;                                 // the chart's state: data, unit, range, the live chart
  /* what a decision's fills did, and its mark on the chart: buys an arrow up under the line, sells an arrow down above
     it, both a square (decisions without fills data count as buys, the only kind before the fills were listed) */
  function fillKind(u) {
    const sides = new Set((u.fills || []).map((f) => f.side));
    return sides.has("sell") ? (sides.has("buy") ? "both" : "sell") : "buy";
  }
  const FILL_MARK = {
    buy: ["belowBar", "arrowUp", "▲", "buy"], sell: ["aboveBar", "arrowDown", "▼", "sell"], both: ["belowBar", "square", "■", "buy and sell"],
  };
  function cpChartOptions(mode) {
    const pct = mode === "pct";
    /* two decimals in percent, on the axis and on the last values' tags alike, as in the readout ("−5.60%", never "−5.6%"
       beside "−3.52%") */
    const nf = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: pct ? 2 : 0, maximumFractionDigits: pct ? 2 : 0 });
    return {
      layout: {
        background: { type: "solid", color: css("--cp-panel") }, textColor: css("--cp-text-2"),
        fontFamily: "Inter, system-ui, -apple-system, sans-serif", fontSize: 12, attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: css("--cp-grid") } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 }, minimumWidth: 76 },
      /* the edges are not fixed: drawChart leaves half a session of room at each end, so the first and last markers
         are not cut by the plot's edge (the reader cannot scroll or zoom: handleScroll, handleScale) */
      timeScale: { borderVisible: false, fixLeftEdge: false, fixRightEdge: false },
      crosshair: {
        mode: 1, horzLine: { visible: false, labelVisible: false },
        vertLine: { color: css("--cp-line-2"), width: 1, style: 0, labelVisible: false },
      },
      localization: {
        priceFormatter: pct ? (p) => `${p > 0.0049 ? "+" : p < -0.0049 ? MINUS : ""}${nf.format(Math.abs(p))}%`
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
      if (u.filled_on) add(u.filled_on, `${plural(u.orders, "order")} filled · ${u.venue ? "Interactive Brokers demo" : "simulated"}`, u);
      const what = scheduled(u) ? `orders scheduled ${wday(tradeDay(u.date))}` : u.filled_on ? "filled later"
        : u.status === "ok" ? "no orders" : "rejected by the rules";
      add(u.date, `Decision on these closes · ${what}`, u);
    }
    return ev;
  }
  /* the range pills, each only when the record is longer than it (else it would show the same as All) */
  function ranges(pts) {
    const first = pts[0][0], last = pts[pts.length - 1][0];
    const span = (Date.parse(last) - Date.parse(first)) / 86400000;
    const back = (days) => new Date(Date.parse(last) - days * 86400000).toISOString().slice(0, 10);
    const out = [];
    if (span > 7) out.push(["1W", back(7), " (the last week)"]);
    if (span > 31) out.push(["1M", back(31), " (the last month)"]);
    if (out.length) out.push(["All", "all", ` (since ${day(first)})`]);
    return out;
  }
  /* what the chart shows: the points in the range and the base each line is measured from. All: the start amount both
     lines begin with (the pills' returns); a shorter range: its first session, so it shows the change over that range,
     as a broker's chart does */
  function view(C) {
    let pts = C.range === "all" ? C.pts : C.pts.filter((p) => p[0] >= C.range);
    if (pts.length < 2) pts = C.pts;
    const all = pts.length === C.pts.length;
    const first = pts.find((p) => ok(p[2])) || pts[0];
    return { pts, all, bv: all ? C.cap : pts[0][1], bb: all ? C.cap : first[2] };
  }
  function readout(i) {
    const C = CH;
    if (!C || !C.ro) return;
    const V = C.v || view(C);
    const p = V.pts[i == null ? V.pts.length - 1 : i];
    if (!p) return;
    const [d, v, b] = p;
    const pct = C.mode === "pct";
    const r = v / V.bv - 1, rb = ok(b) && ok(V.bb) ? b / V.bb - 1 : null;
    const fig = (x, ret) => (pct ? h("b", { class: tone(ret) || null }, sp(ret))
      : [h("b", {}, m$(x)), " ", h("span", { class: tone(ret) || null }, sp(ret))]);
    const ev = i != null ? C.events.get(d) : null;
    const g = gapPts(r, rb);
    C.ro.replaceChildren(
      h("span", { class: "cp-ro-d" }, wday(d)),
      h("span", { class: "cp-ro-i" }, h("i", { class: "cp-sw c" }), "Claude ", fig(v, r)),
      h("span", { class: "cp-ro-i" }, h("i", { class: "cp-sw e" }), "S&P 500 ETF ", ok(b) ? fig(b, rb) : h("b", {}, "—")),
      h("span", { class: "cp-ro-i" }, "Gap ", h("b", { class: tone(g) || null }, ptsTxt(g))),
      h("span", { class: "cp-ro-ev" }, V.all ? `since ${dayShort(C.pts[0][0])}` : `since ${wday(V.pts[0][0])}`));
    C.ev.textContent = ev ? `${ev.text} · click to open it` : "";
    C.plot.classList.toggle("has-event", !!ev);
  }
  function drawChart() {
    const C = CH;
    if (!C || !C.plot.isConnected || !C.plot.clientWidth) return;
    const V = (C.v = view(C));
    readout(null);                               // the latest values, also when the chart library is not available
    const chart = makeChart(C.plot, { euro: false });
    C.chart = chart;
    if (!chart) return;
    chart.applyOptions(cpChartOptions(C.mode));
    C.narrow = C.plot.clientWidth < NARROW_CHART;
    const pct = C.mode === "pct";
    const val = (x, base) => (pct ? (x / base - 1) * 100 : x);
    const bg = css("--cp-panel"), ink = css("--cp-bg");
    const area = chart.addAreaSeries({
      lineColor: css("--cp-series-claude"), topColor: css("--cp-area-top"), bottomColor: css("--cp-area-bot"), lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: bg,
      crosshairMarkerBorderWidth: 2,
    });
    area.setData(V.pts.map(([d, v]) => ({ time: d, value: val(v, V.bv) })));
    const etf = V.pts.filter((p) => ok(p[2]));
    const line = chart.addLineSeries({
      color: css("--cp-series-etf"), lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerRadius: 3, crosshairMarkerBorderColor: bg,
    });
    line.setData(etf.map(([d, , b]) => ({ time: d, value: val(b, V.bb) })));
    /* the start: 0% in percent; in dollars the $100,000 both lines start from (over the whole record only) */
    if (pct || V.all) {
      area.createPriceLine({ price: pct ? 0 : C.cap, color: css("--cp-text-3"), lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: "" });
    }
    /* the last values as tags on the price axis, like a broker's price tag: Claude's green or red by its change over
       the range shown, the ETF's in its line's grey */
    const last = V.pts[V.pts.length - 1];
    const t = tone(last[1] / V.bv - 1);
    const tag = css(t === "up" ? "--cp-up" : t === "down" ? "--cp-down" : "--cp-text");
    area.createPriceLine({ price: val(last[1], V.bv), color: tag, lineVisible: false, axisLabelVisible: true, axisLabelColor: tag,
      axisLabelTextColor: ink, title: "" });
    if (etf.length) {
      const e = css("--cp-series-etf");
      line.createPriceLine({ price: val(etf[etf.length - 1][2], V.bb), color: e, lineVisible: false, axisLabelVisible: true,
        axisLabelColor: e, axisLabelTextColor: ink, title: "" });
    }
    /* the decisions and the fills on the line; a click on one opens that decision in the Decisions panel */
    const days = new Set(V.pts.map((p) => p[0]));
    const marks = [];
    for (const u of C.ups) {
      if (u.filled_on && days.has(u.filled_on)) {
        const [position, shape] = FILL_MARK[fillKind(u)];
        marks.push({ time: u.filled_on, position, shape, color: css("--cp-series-claude"), size: C.narrow ? 0.8 : 1 });
      } else if (!u.filled_on && days.has(u.date)) {
        marks.push({ time: u.date, position: "aboveBar", shape: "circle", color: css("--cp-text-2"), size: C.narrow ? 0.4 : 0.5 });
      }
    }
    /* the line ends on a dot: where Claude stands at the last valuation */
    marks.push({ time: last[0], position: "inBar", shape: "circle", color: css("--cp-series-claude"), size: C.narrow ? 0.5 : 0.6 });
    area.setMarkers(marks.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)));
    const index = new Map(V.pts.map((p, i) => [p[0], i]));
    chart.subscribeCrosshairMove((p) => {
      const k = p && p.time ? timeKey(p.time) : null;
      readout(k && index.has(k) ? index.get(k) : null);
    });
    chart.subscribeClick((p) => {
      const ev = p && p.time ? C.events.get(timeKey(p.time)) : null;
      if (ev) openDecision(ev.u.date);
    });
    /* every session in view, with half a session's room at each end (fitContent would put the first and last points on
       the plot's edges, cutting their markers in two) */
    chart.timeScale().setVisibleLogicalRange({ from: -0.5, to: V.pts.length - 0.5 });
    if (!C.revealed && !still()) { C.revealed = true; C.plot.classList.add("reveal"); }
  }
  function perfPanel(D) {
    const s = D.s, cv = D.cv;
    const pts = (cv && cv.points) || [];
    const n = pts.length;
    const live = s ? s.state === "live" : n > 0;          // without the summary, the curve itself says whether it has started
    const cap = (cv && cv.capital) || (s && s.capital);
    const amount = ok(cap) ? usd0.format(cap) : "same amount";
    const title = "Performance";
    const label = `Claude vs S&P 500 ETF · same ${amount}, same days`;
    CH = null;
    if (!cv) return panel("perf", { label, dot: "bad", title }, failed(D.err.cv));
    if (!live || n < 2) {
      return panel("perf", { label, dot: "wait", title }, h("div", { class: "cp-plot is-empty" }, !live
        ? note("Not invested yet.", s && s.pending ? `The chart starts after the first fills, ${wday(tradeDay(s.pending.decided_on))}.`
          : "The chart starts after the first fills.")
        : note("The comparison starts after the second valuation.", "The first valuation follows the first fills, after the session (~23:00 Berlin).")));
    }
    const plot = h("div", { class: "cp-plot" });
    const ro = h("p", { class: "cp-ro", "aria-hidden": "true" });
    const evNote = h("p", { class: "cp-plot-ev", "aria-hidden": "true" });
    const ups = (D.up && D.up.updates) || [];
    const dates = new Set(pts.map((p) => p[0]));
    CH = { plot, ro, ev: evNote, pts, cap, ups, events: chartEvents(ups, dates), mode: "pct", range: "all", revealed: false };
    plot.setAttribute("role", "img");
    plot.setAttribute("aria-label", `Line chart from ${day(pts[0][0])} to ${day(pts[n - 1][0])}: Claude Portfolio from ` +
      `${m$(pts[0][1])} to ${m$(pts[n - 1][1])}; S&P 500 ETF from ${m$(pts[0][2])} to ${m$(pts[n - 1][2])}. ` +
      "Arrows mark the days orders were filled, up for buys and down for sells, a square for both; dots mark decisions " +
      "that placed no orders.");
    const rg = ranges(pts);
    const tools = [
      rg.length ? seg("Range", rg.map(([label, from, sr]) => [from, label, sr]), "all", (from) => { CH.range = from; drawChart(); }) : null,
      seg("Units", [["pct", "%", " percent"], ["usd", "$", " dollars"]], "pct", (k) => { CH.mode = k; drawChart(); }),
    ];
    const kinds = new Set(ups.filter((u) => u.filled_on && dates.has(u.filled_on)).map(fillKind));
    const marks = { fill: kinds.size > 0, dec: ups.some((u) => !u.filled_on && dates.has(u.date)) };
    /* the values behind the chart, for screen readers (the chart itself is a picture). Hidden by a wrapper: a table keeps
       the width of its content whatever its own width says, so on its own it reached 1px past a 320px screen */
    const table = h("div", { class: "sr-only" }, h("table", {}, h("caption", {}, "Value after each session"),
      h("thead", {}, h("tr", {}, ["Date", "Claude Portfolio", "S&P 500 ETF"].map((x) => h("th", { scope: "col" }, x)))),
      h("tbody", {}, [...pts].reverse().map(([d, v, b]) => h("tr", {}, h("td", {}, day(d)), h("td", {}, m$(v)), h("td", {}, m$(b)))))));
    const foot = h("div", { class: "cp-pf" },
      h("p", { class: "cp-keys" }, marks.dec ? h("span", {}, h("span", { class: "k-dec", "aria-hidden": "true" }, "●"), " decision") : null,
        ["buy", "sell", "both"].filter((k) => kinds.has(k)).map((k) =>
          h("span", {}, h("span", { class: "k-fill", "aria-hidden": "true" }, FILL_MARK[k][2]), ` ${FILL_MARK[k][3]}`)),
        marks.dec || marks.fill ? h("span", {}, "click one to open it") : null),
      h("p", {}, "Lang & Schwarz indicative prices · chart: ", extLink("https://www.tradingview.com/", "TradingView")));
    return panel("perf", { label, title, tools }, ro, h("div", { class: "cp-plot-w" }, plot, evNote), table, foot);
  }

  /* ---------------------------------------------------------------- Holdings */
  /* Claude's conviction in a name (from the decision of 18 Nov 2026): a small label with a three-step meter */
  const CONV = { high: 3, medium: 2, low: 1 };
  function convLabel(c) {
    if (!CONV[c]) return null;
    return h("span", { class: "cp-conv", title: "How sure Claude is of this holding, in its own words: high, medium or low" },
      h("span", { class: "bars", "aria-hidden": "true" }, [1, 2, 3].map((i) => h("i", { class: i <= CONV[c] ? "on" : null }))),
      `${c[0].toUpperCase()}${c.slice(1)} conviction`);
  }
  /* "Since bought 19 Oct: +4.2% · ETF +1.1%": the holding's gain (the Gain column) and the S&P 500 ETF over the same days,
     the same dollars on the days of its buys (cp_api since_bought) */
  function sinceLine(sb) {
    if (!sb || !ok(sb.return) || !sb.from) return null;
    return h("p", { class: "cp-vsetf" }, `Since bought ${dayShort(sb.from)}${sb.buys > 1 ? ` (${sb.buys} buys)` : ""}: `,
      h("b", { class: tone(sb.return) || null }, sp1(sb.return)), h("span", { class: "cp-sep", "aria-hidden": "true" }, " · "),
      "ETF ", h("b", { class: ok(sb.etf) ? tone(sb.etf) || null : null }, sp1(sb.etf)));
  }
  /* the company's logo in its badge (logos.py, logos/index.json, 21 Nov 2026); the ticker stays for screen readers and
     wherever there is no logo */
  let LOGOS = new Set();
  const tkBadge = (t) => (LOGOS.has(t)
    ? h("span", { class: "cp-tk has-logo", title: t }, h("img", { src: `logos/${t.replace(".", "_")}.png`, alt: "", width: 64, height: 64, loading: "lazy", decoding: "async" }),
      h("span", { class: "sr-only" }, t))
    : h("span", { class: "cp-tk" }, t));
  function holdRow(r, live) {
    const id = `hold-${r.ticker}`;
    const since = live ? sinceLine(r.since_bought) : null;
    const can = !!(r.thesis || r.risks || r.exit_if || since);
    const kids = [tkBadge(r.ticker),
      h("span", { class: "cp-nm" }, h("b", {}, r.name || r.ticker), h("small", {}, r.sector || "")),
      h("span", { class: "w" }, h("span", { class: "sr-only" }, live ? ", weight " : ", target "), wp(r.weight)),
      live ? h("span", { class: `g ${tone(r.gain_pct)}` }, h("span", { class: "sr-only" }, ", gain since bought "), sp(r.gain_pct, fmt.p1)) : null];
    if (!can) return h("li", {}, h("div", { class: "cp-hrow" }, kids));
    const btn = h("button", { class: "cp-hrow", type: "button", "aria-expanded": "false", "aria-controls": id, title: r.name || null }, kids, chev());
    const meta = live ? [`${fmt.n4.format(r.shares)} shares`, `paid ${m$(r.paid)}`, `last price ${m$(r.price)}`,
      since ? null : `held since ${r.since ? day(r.since) : "—"}`].filter(Boolean) : [`target weight ${wp(r.weight)}`];
    const conv = convLabel(r.conviction);
    const det = h("div", { class: "cp-hdet", id, hidden: true },
      since || conv ? h("div", { class: "cp-hdet-top" }, since, conv) : null,
      r.thesis ? h("p", {}, h("span", { class: "k" }, "Why Claude holds it"), prose(r.thesis)) : null,
      r.risks ? h("p", {}, h("span", { class: "k" }, "What could go wrong"), prose(r.risks)) : null,
      r.exit_if ? h("p", {}, h("span", { class: "k" }, "Exit if"), prose(r.exit_if)) : null,
      h("p", { class: "meta" }, meta.join(" · ")));
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open));
      det.hidden = !open;
      if (open) det.scrollIntoView({ block: "nearest", behavior: still() ? "auto" : "smooth" });
    });
    return h("li", {}, btn, det);
  }
  function holdPanel(D) {
    const s = D.s, hd = D.hd;
    const title = "Holdings";
    if (!s) return panel("hold", { label: "Positions", dot: "bad", title }, failed(D.err.s));
    const live = s.state === "live";
    if (live && !hd) return panel("hold", { label: "Positions", dot: "bad", title }, failed(D.err.hd));
    const rows = live ? hd.rows || [] : (s.pending && s.pending.targets) || [];
    const label = live ? `${plural(rows.length, "position")} · valued ${dayShort(hd.as_of || s.as_of)}`
      : s.pending ? `Claude's first picks · orders ${wday(tradeDay(s.pending.decided_on))}` : "Not invested yet";
    if (!rows.length) return panel("hold", { label, dot: "wait", title }, note(`Claude's first decision is due ${wday(s.next_decision)}.`));
    const head = h("div", { class: `cp-hl-h${live ? "" : " no-g"}`, "aria-hidden": "true" }, h("span", {}, "Stock"),
      h("span", {}, live ? "Weight" : "Target"), live ? h("span", {}, "Gain") : null);
    const list = h("ul", { class: `cp-hl${live ? "" : " no-g"}`, "aria-label": live ? "Holdings, largest first: open one for its thesis"
      : "Claude's first picks, largest first: open one for its thesis" }, rows.map((r) => holdRow(r, live)));
    const cash = live ? s.cash_weight : s.pending ? s.pending.cash : null;
    const tail = ok(cash) ? h("div", { class: `cp-hl-cash${live ? "" : " no-g"}` }, h("span", { class: "cp-tk cash" }, "$"), h("b", {}, "Cash"),
      h("span", { class: "w" }, wp(cash)), live ? h("span", { class: "g" }, usd0.format(hd.cash)) : null) : null;
    return panel("hold", { label, dot: live ? "ok" : "wait", title }, head, h("div", { class: "cp-scroll" }, list), tail);
  }

  /* ---------------------------------------------------------------- Risk vs S&P 500 ETF
     29 Oct 2026, the owner's request (a portfolio manager's advice): the measures professionals expect. A figure appears
     only when it means something: beta from 5 daily returns (with their n), the annualized measures from 20 sessions
     (cp_api._risk sends null before, so no figure from a handful of days leaves the app), drawdown from 5 sessions. The
     formulas and the risk-free rate used are behind "How computed". Correlation and Sortino stay off the page. */
  const RISK_FROM = { rel: 5, annual: 20, stats: 5 };
  const sg = (x) => (ok(x) ? tn(x, sp(x)) : "—");
  /* [key, name, gate, format, own: a figure for each side (else Claude measured against the ETF), definition] */
  const RISK = [
    ["beta", "Beta", "rel", (x) => unsigned(x, fmt.n2), false, "How much Claude's value tends to move when the ETF moves 1%."],
    ["max_drawdown", "Max drawdown", "stats", sg, true, "The largest fall from a previous high, on the daily values."],
    ["volatility", "Volatility", "annual", (x) => unsigned(x, fmt.p2), true, "How widely the value swings from day to day, scaled to a year."],
    ["sharpe", "Sharpe ratio", "annual", (x) => unsigned(x, fmt.n2), true, "Return above the risk-free rate for each unit of volatility, per year."],
    ["alpha", "Jensen's alpha", "annual", sg, false, "Return per year beyond what the ETF's moves and Claude's beta explain."],
    ["tracking_error", "Tracking error", "annual", (x) => unsigned(x, fmt.p2), false, "How far the daily returns stray from the ETF's, scaled to a year."],
    ["information_ratio", "Information ratio", "annual", (x) => unsigned(x, fmt.n2), false, "Return ahead of the ETF for each unit of tracking error, per year."],
  ];
  /* the formulas cp_api._risk_math and _stats compute, in the same notation */
  const RISK_FORMULAS = [
    ["Daily returns", "r = value(t) / value(t − 1) − 1, for Claude (rp) and the ETF (rb), on the sessions both have"],
    ["Risk-free rate", "rf = (1 + y)^(1/252) − 1 a day, y = the latest US 3-month Treasury bill rate (discount basis, FRED DTB3)"],
    ["sd, var, cov", "sample statistics of the daily returns (divided by n − 1)"],
    ["Volatility", "sd(r) × √252"],
    /* no-break spaces keep the bracket in one piece where the line wraps (phones) */
    ["Max drawdown", "min over t of [ value(t) / peak(t) − 1 ], peak(t) = the highest value up to and including t"],
    ["Sharpe ratio", "mean(r − rf) / sd(r − rf) × √252"],
    ["Beta", "cov(rp, rb) / var(rb)"],
    ["Jensen's alpha", "252 × [ mean(rp − rf) − beta × mean(rb − rf) ]"],
    ["Tracking error", "sd(rp − rb) × √252"],
    ["Information ratio", "252 × mean(rp − rb) / tracking error"],
  ];
  function riskPanel(D) {
    const st = (D.cv && D.cv.stats) || {}, rk = st.risk || {}, s = D.s || {};
    const sessions = rk.sessions ?? st.sessions ?? 0, n = rk.n ?? Math.max(0, sessions - 1);
    const toGo = Math.max(0, RISK_FROM.annual - sessions);
    const title = "Risk vs S&P 500 ETF";
    if (!D.cv) return panel("risk", { label: "Measured on the daily values", dot: "bad", title }, failed(D.err.cv));
    const shown = (gate) => (gate === "rel" ? n >= RISK_FROM.rel : gate === "annual" ? sessions >= RISK_FROM.annual
      : sessions >= RISK_FROM.stats);
    /* a measure not shown yet: the cell says from when (the sessions to go are said once, in the note) */
    const gated = (gate) => h("td", { class: "is-gated", colspan: 2 },
      h("span", { class: "cp-lock" }, lockIc(), gate === "rel" ? `from ${RISK_FROM.rel} daily returns` : `from ${RISK_FROM[gate]} sessions`));
    const na = () => h("td", { class: "na" }, h("span", { "aria-hidden": "true" }, "—"),
      h("span", { class: "sr-only" }, "not applicable: measured against the ETF"));
    const src = (key) => (key === "volatility" || key === "max_drawdown" ? [st[key], st[`bench_${key}`]] : [rk[key], rk[`bench_${key}`]]);
    const rows = RISK.map(([key, label, gate, f, own, def]) => {
      const name = h("th", { scope: "row", title: def }, label);
      if (!shown(gate)) return h("tr", {}, name, gated(gate));
      const [a, b] = src(key);
      if (own) return h("tr", {}, name, h("td", {}, f(a)), h("td", {}, f(b)));
      /* beta's n goes before its figure on screen (cp.css .cp-fig), so the figure lines up with the others */
      return h("tr", {}, name, h("td", {}, gate === "rel" ? h("span", { class: "cp-fig" }, f(a), h("small", { class: "cp-n" }, ` n = ${n}`))
        : f(a)), na());
    });
    const tbl = h("table", { class: "cp-rk" }, h("caption", { class: "sr-only" }, "Risk and return: Claude Portfolio and the S&P 500 ETF"),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, h("span", { class: "sr-only" }, "Measure")),
        h("th", { scope: "col" }, h("i", { class: "cp-sw c", "aria-hidden": "true" }), "Claude"),
        h("th", { scope: "col" }, h("i", { class: "cp-sw e", "aria-hidden": "true" }), "ETF"))),
      h("tbody", {}, rows));
    const caveat = sessions >= RISK_FROM.annual ? `On n = ${n} daily returns. Past results do not predict future results.`
      : n >= RISK_FROM.rel ? `Beta on n = ${n} daily returns; the annualized measures need ${RISK_FROM.annual} sessions` +
        `${toGo ? ` (${toGo} to go)` : ""}. ${plural(sessions, "session")} say${sessions === 1 ? "s" : ""} little about skill.`
        : `The measures fill in as the record grows: beta from ${RISK_FROM.rel} daily returns, the annualized ones from ` +
          `${RISK_FROM.annual} sessions.`;
    /* Claude's return counts from its fills, the ETF's from the first valuation (cp_book.mark sets it to the capital
       there): the like-for-like pair measures both from that valuation */
    const ff = ok(st.return_from_first_mark) && st.first_mark
      ? [` Like for like, both from the first valuation (${dayShort(st.first_mark)}): Claude `, sg(st.return_from_first_mark), ", ETF ",
        sg(st.bench_return_from_first_mark), "."] : [];
    const rf = rk.rf;
    const fred = extLink("https://fred.stlouisfed.org/series/DTB3", "FRED series DTB3");
    const rfLine = !rf ? [] : rf.status === "unavailable" ? ["Risk-free rate unavailable, 0% used."]
      : [`Risk-free rate for the Sharpe ratio and alpha: ${fmt.n2.format(rf.pct)}% a year (discount basis), the US ` +
        `3‑month Treasury bill on ${rf.date ? day(rf.date) : "the latest date"} (`, fred,
      rf.status === "cached" ? `; the copy fetched ${rf.fetched_on ? day(rf.fetched_on) : "earlier"}, as ` +
          `${rf.refreshing ? "today's update from FRED had not arrived yet" : "FRED could not be reached"}).` : ")."];
    const how = h("details", { class: "cp-how" }, h("summary", {}, "How computed"),
      h("div", { class: "cp-how-b" },
        h("dl", {}, RISK.map(([, label, , , , def]) => h("div", {}, h("dt", {}, label), h("dd", {}, def)))),
        h("dl", { class: "f" }, RISK_FORMULAS.map(([t, f]) => h("div", {}, h("dt", {}, t), h("dd", {}, f)))),
        h("p", {}, "Returns: Claude's counts from its fills at the broker's prices, after commissions; the ETF's from the first " +
          "valuation, after that session.", ...ff),
        h("p", {}, `n = ${plural(n, "daily simple return")}, each from two consecutive sessions with both values. Shown only ` +
          `when they can mean something: beta from ${RISK_FROM.rel} daily returns, the annualized measures from ` +
          `${RISK_FROM.annual} sessions; 252 sessions make a year. Claude's values are after commissions.`),
        rfLine.length ? h("p", {}, ...rfLine) : null));
    const start = s.start || (D.cv && D.cv.start);
    const label = sessions ? `${plural(sessions, "session")}${start ? ` since ${dayShort(start)}` : ""}` : "No sessions yet";
    /* under the measured figures (17 Nov 2026): Claude's own reading of the portfolio's risk (its latest decision that
       gives one, method 2, from 18 Nov 2026), marked as its words; until there is one, the portfolio's biggest bets
       against the S&P 500 (cp_api sector_bets: the three sectors furthest from the index's weight, Claude's minus the
       index's, in percentage points; no green or red, as an overweight is neither a gain nor a loss). One of the two, in
       the page's flow: never a box that scrolls, and the row keeps its height. What Claude watches is in each decision */
    const ups = (D.up && D.up.updates) || [];
    const bets = (s.sector_bets || []).filter((x) => x && x.sector && ok(x.diff)).slice(0, 3);
    const both = (x) => `Claude ${wp(x.weight)}, S&P 500 ${wp(x.sp500)}`;
    const betList = bets.length ? h("section", { class: "cp-rx-s", "aria-labelledby": "cp-bets-t" },
      h("h3", { class: "cp-k", id: "cp-bets-t", title: "Claude's weight in a sector minus the S&P 500's, in percentage points" },
        "Biggest bets against the S&P 500"),
      h("ul", { class: "cp-bets" }, bets.map((x) => h("li", { title: `${x.sector}: ${both(x)}` },
        h("span", {}, x.sector), h("b", {}, ptsTxt(x.diff * 100, fmt.n1)), h("span", { class: "sr-only" }, `, ${both(x)}`))))) : null;
    const view = ups.find((u) => u.portfolio_risk);
    const said = view ? h("figure", { class: "cp-quote cp-rq" }, h("blockquote", {}, `“${prose(view.portfolio_risk)}”`),
      h("figcaption", {}, `Claude on the portfolio's risk, ${wday((view.decided_at && berlinDate(view.decided_at)) || view.date)}`)) : null;
    const more = said ? [said] : betList ? [betList] : [];
    return panel("risk", { label, dot: toGo ? "wait" : "ok", title }, tbl, h("p", { class: "cp-caveat" }, caveat),
      more.length ? h("div", { class: "cp-rx" }, h("div", { class: "cp-rx-in" }, more)) : null, how);
  }

  /* ---------------------------------------------------------------- Decisions (like a broker's order list) */
  /* the Result column: Traded (green), Scheduled, Held, No orders (rejected, or every intended change under the minimum) */
  function resultOf(u, s) {
    if (u.filled_on) return ["Traded", "up"];
    if (scheduled(u)) return ["Scheduled", "sched"];
    if (u.status !== "ok") return ["No orders", "none"];
    return [meantSkips(u, s).length ? "No orders" : "Held", "none"];
  }
  /* the weight changes a held decision meant but did not trade (under the minimum change). Targets that only restate the
     current weights (under 0.1 point apart) say nothing; a deliberate small change is named, and so is one that would
     have brought a weight back inside a limit (a trim to the cap) */
  function meantSkips(u, s) {
    const sk = u.skipped_small || [];
    if (u.status !== "ok" || u.orders || scheduled(u) || u.filled_on || !sk.length) return [];
    const lim = limitsOf(s);
    const crosses = (x) => (ok(lim.weight_max) && x.from > lim.weight_max && x.to <= lim.weight_max)
      || (ok(lim.weight_min) && x.from < lim.weight_min && x.to >= lim.weight_min);
    return sk.filter((x) => Math.abs(x.to - x.from) >= 0.001 || crosses(x));
  }
  function skippedNote(u, s, names) {
    const meant = meantSkips(u, s);
    if (!meant.length) return null;
    const mc = limitsOf(s).min_change;
    const rule = ok(mc) ? `Weight changes under ${fmt.n0.format(mc * 100)} percentage point${mc === 0.01 ? "" : "s"} are not traded (rule)`
      : "Weight changes under the minimum are not traded (rule)";
    const shown = meant.filter((x) => wp(x.from) !== wp(x.to)).slice(0, 3)
      .map((x) => `${names[x.ticker] ? `${names[x.ticker]} (${x.ticker})` : x.ticker} ${wp(x.from)} → ${wp(x.to)}`);
    const placed = u.pending ? "places" : "placed";
    return h("p", { class: "cp-dd-x" }, shown.length ? `Not traded: ${shown.join(", ")}. ${rule}, so this decision ${placed} no orders.`
      : `${rule}; every change in this decision was smaller, so it ${placed} no orders.`);
  }
  /* the Changes column: +NEW, −CLOSED, "TICKER trim" or "TICKER add" for a resized holding (also one the fills show
     traded without a listed change, such as a trim back to the cap); at most three, then "N more" */
  function changeList(u) {
    const out = [];
    (u.new || []).forEach((x) => out.push(["new", `+${x.ticker}`, `${x.ticker}: new position, ${wp(x.to)}`]));
    (u.closed || []).forEach((x) => out.push(["out", `${MINUS}${x.ticker}`, `${x.ticker}: sold, was ${wp(x.from)}`]));
    (u.resized || []).forEach((x) => out.push(["rs", `${x.ticker} ${x.to < x.from ? "trim" : "add"}`, `${x.ticker}: ${wp(x.from)} → ${wp(x.to)}`]));
    const named = new Set([...(u.new || []), ...(u.closed || []), ...(u.resized || [])].map((x) => x.ticker));
    for (const f of u.fills || []) {
      if (named.has(f.ticker)) continue;
      named.add(f.ticker);
      out.push(["rs", `${f.ticker} ${f.side === "sell" ? "trim" : "add"}`, `${f.ticker}: ${f.side === "sell" ? "sold" : "bought"} ${fmt.n4.format(f.shares)} shares`]);
    }
    return out;
  }
  function changeChips(u, max = 3) {
    const all = changeList(u);
    if (!all.length) return h("span", { class: "cp-na" }, "—");
    /* the ticker in full weight, the kind of change ("trim", "add") lighter: +HUM, MRK trim */
    const label = (t) => { const [a, b] = t.split(" "); return b ? [a, h("span", { class: "k" }, `\u00a0${b}`)] : t; };
    return h("span", { class: "cp-chips" }, all.slice(0, max).map(([cls, t, title]) => h("span", { class: `cp-chip ${cls}`, title }, label(t))),
      all.length > max ? h("span", { class: "cp-chip more", title: all.slice(max).map((x) => x[1]).join(" ") }, `${all.length - max} more`) : null);
  }
  /* each fill of a decision against the S&P 500 ETF over the same days (cp_api _scorecard, 17 Nov 2026): the price change
     from the fill to the latest price and the ETF's change over the same sessions, then the trade's effect in points:
     for a buy the share's change minus the ETF's, for a sale the ETF's change minus the share's (a share that did worse
     after it was sold makes the sale positive), so green means the trade helped either way (17 Nov 2026). Track record
     uses the same effect */
  const effectOf = (x) => (ok(x.change) && ok(x.etf) ? (x.side === "sell" ? x.etf - x.change : x.change - x.etf) * 100 : null);
  function scorecard(u) {
    const rows = (u.scorecard || []).filter((x) => x && x.ticker);
    if (!rows.length) return null;
    const dates = rows.map((x) => x.to).filter(Boolean).sort();
    const to = dates[dates.length - 1];
    const buys = rows.filter((x) => x.side !== "sell" && ok(x.change) && ok(x.etf));
    const ahead = buys.filter((x) => x.change > x.etf).length;
    const sn = (x) => h("td", { class: `num ${ok(x) ? tone(x) : ""}`.trim() }, sp1(x));
    const body = rows.map((x) => {
      const sell = x.side === "sell";
      const g = effectOf(x);
      return h("tr", {}, h("th", { scope: "row" }, x.ticker),
        h("td", { class: "f" }, `${sell ? "Sold" : "Bought"} ${x.date ? dayShort(x.date) : ""}`, h("span", { class: "px" }, ` at ${m$(x.price)}`)),
        ok(x.change) ? sn(x.change) : h("td", { class: "num cp-na", title: "No valuation after this fill yet" }, "—"),
        ok(x.change) ? sn(x.etf) : h("td", { class: "num cp-na" }, "—"),
        h("td", { class: `num g ${ok(g) ? tone(g) : ""}`.trim() }, ptsTxt(g, fmt.n1),
          x.to && to && x.to !== to ? h("small", {}, ` to ${dayShort(x.to)}`) : null));
    });
    const sells = rows.some((x) => x.side === "sell");
    return h("div", { class: "cp-sc" },
      h("p", { class: "k" }, "Since the fills", to ? ` · to ${dayShort(to)}` : "",
        buys.length > 1 ? h("span", { class: "cp-sc-n" }, ` · ${ahead} of ${buys.length} buys ahead of the ETF`) : null),
      h("div", { class: "cp-sc-w" }, h("table", { class: "cp-sc-t" },
        h("caption", { class: "sr-only" }, "Each fill of this decision against the S&P 500 ETF over the same days"),
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Stock"), h("th", { scope: "col", class: "f" }, "Fill"),
          h("th", { scope: "col", class: "num" }, sells ? "Price since" : "Since bought"), h("th", { scope: "col", class: "num" }, "ETF"),
          h("th", { scope: "col", class: "num", title: "What the trade gained against the ETF, in points" }, "Effect"))),
        h("tbody", {}, body))),
      h("p", { class: "cp-sc-x" }, `The price change from each fill to the last valuation${to ? ` (${dayShort(to)})` : ""}, against the ` +
        "S&P 500 ETF over the same days, before commissions. Effect: what the trade gained against the ETF, in points." +
        (sells ? " For a sale it is turned around: a share that did worse than the ETF after it was sold makes the sale " +
        "positive." : "")));
  }
  /* a decision's richer answer (method 2, from 18 Nov 2026): what Claude watches, what it looked at and passed on */
  function decLists(u) {
    const watch = (u.watch || []).filter((x) => x && x.what);
    const cons = (u.considered || []).filter((x) => x && x.ticker);
    if (!watch.length && !cons.length) return null;
    const sec = (k, items) => h("div", { class: "cp-dd-sec" }, h("p", { class: "k" }, k), h("ul", { class: "cp-dd-list" }, items));
    return h("div", { class: "cp-dd-cols" },
      watch.length ? sec("Watching", watch.map((x) => h("li", {}, h("span", { class: "d" }, x.date ? wday(x.date) : "Ongoing"),
        h("span", { class: "t" }, prose(x.what))))) : null,
      cons.length ? sec("Also considered", cons.map((x) => h("li", {}, h("b", { class: "d" }, x.ticker),
        h("span", { class: "t" }, x.why_not ? prose(x.why_not) : "No reason given.")))) : null);
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
  function decDetail(u, k, s, names) {
    const when = wday((u.decided_at && berlinDate(u.decided_at)) || u.date);
    const box = h("div", { class: "cp-dd" });
    /* a decision made with the richer brief and answer of 17 Nov 2026 carries "method 2": a small mark that opens How it
       works, whose Method changes list says what changed */
    const method = ok(u.method) && u.method >= 2 ? h("a", { class: "cp-tag", href: HOW_HREF, "aria-haspopup": "dialog",
      title: "What changed with this method: How it works, Method changes" }, `method ${u.method}`) : null;
    box.append(h("p", { class: "cp-dd-h" }, `Decision ${String(k).padStart(2, "0")} · on the ${dayShort(u.date)} closes`,
      u.decided_at ? ` · decided ${utcStamp(u.decided_at)}` : "", ok(u.searches) ? ` · web searches: ${u.searches}` : "",
      method ? [" ", method] : null));
    if (u.rules_hash && s && s.rules_hash && u.rules_hash !== s.rules_hash) box.append(h("p", { class: "cp-callout" }, earlierRules(u, s)));
    box.append(u.alert ? h("blockquote", { class: "cp-note" }, `“${prose(u.alert)}”`)
      : h("p", { class: "cp-dd-x" }, u.status === "ok" ? "No note this time."
        : prose(u.reason) || "No readable answer this time; the portfolio stayed as it was."));
    const lines = [];
    (u.new || []).forEach((x) => lines.push(h("li", {}, h("b", {}, `+${x.ticker}`), ` new, ${wp(x.to)}`,
      CONV[x.conviction] ? ` · ${x.conviction} conviction` : "", x.thesis ? ` · ${prose(x.thesis)}` : "")));
    (u.closed || []).forEach((x) => lines.push(h("li", {}, h("b", {}, `${MINUS}${x.ticker}`), ` sold, was ${wp(x.from)}`)));
    (u.resized || []).forEach((x) => lines.push(h("li", {}, h("b", {}, x.ticker), ` ${wp(x.from)} → ${wp(x.to)}`)));
    if (lines.length) box.append(h("ul", { class: "cp-dd-chg", "aria-label": "Changes" }, lines));
    const skip = skippedNote(u, s, names);
    if (skip) box.append(skip);
    if (u.portfolio_risk) {
      box.append(h("div", { class: "cp-dd-sec" }, h("p", { class: "k" }, "Portfolio risk"), h("p", { class: "t" }, prose(u.portfolio_risk))));
    }
    const lists = decLists(u);
    if (lists) box.append(lists);
    const sc = scorecard(u);
    if (sc) box.append(sc);
    const more = (summary, body, cls) => h("details", { class: `cp-more${cls ? ` ${cls}` : ""}` }, h("summary", {}, summary), h("div", {}, body));
    const disc = [];
    if (u.market_view) disc.push(more("Market view", h("p", {}, prose(u.market_view))));
    if (u.self_review && u.self_review.trim().toLowerCase() !== "first decision") disc.push(more("Looking back", h("p", {}, prose(u.self_review))));
    if ((u.repairs || []).length) disc.push(more(`Rule fixes (${u.repairs.length})`, h("ul", {}, u.repairs.map((r) => h("li", {}, prose(r)))), "fix"));
    if (disc.length) box.append(h("div", { class: "cp-dd-more" }, disc));
    const fill = u.filled_on ? (u.venue ? `Filled ${dayShort(u.filled_on)} at Interactive Brokers (demo), ${plural(u.orders, "order")}`
      : `Filled ${dayShort(u.filled_on)}, simulated at the Lang & Schwarz session end, ${plural(u.orders, "order")}`)
      : scheduled(u) ? `Orders scheduled ${wday(tradeDay(u.date))}, 20:15 Berlin` : "No orders";
    box.append(h("p", { class: "cp-dd-proof" }, h("span", {}, fill),
      u.sha256 ? h("span", {}, "SHA-256 ", fingerprint(u.sha256, `the decision of ${when}`, { long: true })) : null,
      h("span", {}, extLink(HISTORY_URL, "version history ↗"))));
    return box;
  }
  let DEC = null;                                // the decision rows by date, the "Show all" button, the quote's target
  function setDec(r, open) {
    r.btn.setAttribute("aria-expanded", String(open));
    r.tr.classList.toggle("open", open);
    r.det.hidden = !open;
  }
  function revealDecisions() {
    if (!DEC) return;
    DEC.rows.forEach((r) => { r.tr.hidden = false; });
    if (DEC.all) { DEC.all.remove(); DEC.all = null; }
  }
  /* a chart marker or the quote's link: that decision's row, open, in view */
  function openDecision(date) {
    const r = DEC && DEC.rows.get(date);
    if (!r) return;
    if (r.tr.hidden) revealDecisions();
    setDec(r, true);
    r.tr.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
    r.btn.focus({ preventScroll: true });
  }
  /* the company names the page knows, by ticker: the holdings', then the first picks' */
  function namesOf(D) {
    const s = D.s || {}, names = {};
    ((D.hd && D.hd.rows) || []).forEach((r) => { if (r.name) names[r.ticker] = r.name; });
    ((s.pending && s.pending.targets) || []).forEach((r) => { if (r.name && !names[r.ticker]) names[r.ticker] = r.name; });
    return names;
  }
  function decPanel(D) {
    const ups = D.up ? D.up.updates || [] : null;
    const title = "Decisions";
    DEC = null;
    if (!ups) return panel("dec", { label: "Twice a week", dot: "bad", title }, failed(D.err.up));
    if (!ups.length) {
      return panel("dec", { label: "Twice a week", dot: "wait", title },
        note("No decision yet.", D.s ? `The first one is due ${wday(D.s.next_decision)}.` : null));
    }
    const s = D.s || {};
    const trades = ups.filter((u) => u.filled_on).length;
    const orders = ups.reduce((a, u) => a + (u.filled_on ? u.orders || 0 : 0), 0);
    const names = namesOf(D);
    DEC = { rows: new Map(), all: null };
    const fold = ups.length > DEC_SHOWN + 2;      // a "Show all" for one or two rows would only cost a click
    const body = h("tbody", {});
    ups.forEach((u, i) => {
      const k = ups.length - i;
      const when = wday((u.decided_at && berlinDate(u.decided_at)) || u.date);
      const id = `dec-${u.date}`;
      const btn = h("button", { class: "cp-dbtn", type: "button", "aria-expanded": "false", "aria-controls": id },
        chev(), h("span", {}, when), h("span", { class: "sr-only" }, `: decision ${k}, Claude's note`));
      const [res, rc] = resultOf(u, s);
      const where = u.venue ? "Interactive Brokers demo" : "Simulated";
      /* phones show the orders and their venue together (the venue column is hidden there): the "sm" part */
      const ordersCell = u.filled_on ? [String(u.orders), h("span", { class: "sm" }, ` ${u.orders === 1 ? "order" : "orders"} · ${where}`)]
        : scheduled(u) ? `due ${wday(tradeDay(u.date))}` : h("span", { class: "cp-na" }, "—");
      const venue = u.filled_on ? where : h("span", { class: "cp-na" }, "—");
      const tr = h("tr", { class: "cp-drow" },
        h("td", { class: "c-date" }, btn),
        h("td", { class: `c-res ${rc}` }, res),
        h("td", { class: "c-chg" }, changeChips(u)),
        h("td", { class: "c-ord" }, ordersCell),
        h("td", { class: "c-ven" }, venue),
        h("td", { class: "c-fp" }, fingerprint(u.sha256, `the decision of ${when}`)));
      const det = h("tr", { class: "cp-ddet", id, hidden: true }, h("td", { colspan: 6 }, decDetail(u, k, s, names)));
      const r = { tr, det, btn };
      /* the whole row opens the note (its button is the keyboard's way in); a copy button or a link keeps its own click */
      tr.addEventListener("click", (e) => {
        const c = e.target.closest && e.target.closest("button, a");
        if (c && c !== btn) return;
        setDec(r, btn.getAttribute("aria-expanded") !== "true");
      });
      if (fold && i >= DEC_SHOWN) tr.hidden = true;
      DEC.rows.set(u.date, r);
      body.append(tr, det);
    });
    const tbl = h("table", { class: "cp-dt" }, h("caption", { class: "sr-only" }, "Every decision, newest first: open one for Claude's note"),
      h("thead", {}, h("tr", {}, ["Date", "Result", "Changes", "Orders", "Venue", "Fingerprint"].map((x, i) =>
        h("th", { scope: "col", class: ["c-date", "c-res", "c-chg", "c-ord", "c-ven", "c-fp"][i] }, x)))),
      body);
    if (fold) {
      DEC.all = h("button", { class: "cp-btn pri cp-all", type: "button" }, `Show all ${ups.length} decisions`);
      DEC.all.addEventListener("click", () => {
        const first = [...DEC.rows.values()][DEC_SHOWN];
        revealDecisions();
        if (first) first.btn.focus();            // the button is gone: focus goes to the first row it revealed
      });
    }
    /* the newest decision's note, in view by default as a short quote */
    const top = ups.find((u) => u.alert);
    const quote = top ? h("figure", { class: "cp-quote" }, h("blockquote", {}, `“${prose(top.alert)}”`),
      h("figcaption", {}, `Claude, ${wday((top.decided_at && berlinDate(top.decided_at)) || top.date)} · `,
        h("button", { class: "cp-link", type: "button", onclick: () => openDecision(top.date) }, "Read the full note"))) : null;
    const label = `${plural(ups.length, "decision")} · ${trades} with trades · ${plural(orders, "order")} filled`;
    return panel("dec", { label, title }, quote, h("div", { class: "cp-dt-wrap" }, tbl), DEC.all);
  }

  /* ---------------------------------------------------------------- Allocation */
  function allocPanel(D) {
    const s = D.s;
    const title = "Allocation";
    if (!s) return panel("alloc", { label: "By sector", dot: "bad", title }, failed(D.err.s));
    const live = s.state === "live", lim = limitsOf(s);
    const rows = live ? (D.hd && D.hd.rows) || [] : (s.pending && s.pending.targets) || [];
    const count = {};
    rows.forEach((r) => { const k = r.sector || "Other"; count[k] = (count[k] || 0) + 1; });
    const cash = live ? s.cash_weight : s.pending ? s.pending.cash : 1;
    const secs = s.sectors || [];
    const top = Math.max(...secs.map((x) => x.weight), 0.0001);
    const ws = rows.map((r) => r.weight).filter(ok);
    const big = ws.length ? rows.find((r) => r.weight === Math.max(...ws)) : null;
    const cm = ok(lim.cash_max) ? lim.cash_max : null;
    /* the S&P 500's own weight by sector (cp_api sp500_sectors, from 17 Nov 2026) beside the portfolio's: a light tick on
       each bar and a grey figure, the index's date in the label and its source in the tooltips; the index's sectors Claude
       does not hold are listed in one line under them. Without that file the panel is as before */
    const sx = s.sp500_sectors && Array.isArray(s.sp500_sectors.weights) ? s.sp500_sectors : null;
    const ix = new Map(sx ? sx.weights.filter((x) => x && x.sector && ok(x.weight)).map((x) => [x.sector, x.weight]) : []);
    const vs = ix.size > 0;
    const ixOn = vs && sx.as_of ? ` · S&P 500 on ${dayShort(sx.as_of)}` : vs ? " · S&P 500" : "";
    const ixAbout = vs ? `S&P 500 weights by sector${sx.as_of ? ` on ${day(sx.as_of)}` : ""}` +
      `${ok(sx.coverage) ? `, ${p0(sx.coverage)} of the index covered` : ""}${sx.source ? `; source: ${sx.source}` : ""}` : null;
    const label = (live ? `By sector · valued ${dayShort(s.as_of)}` : s.pending ? "By sector · target weights" : "By sector") + ixOn;
    const barLabel = `Invested ${wp(1 - cash)}, cash ${wp(cash)}${cm != null ? `; cash limit ${p0(cm)}` : ""}`;
    const flag = (bad) => (bad ? h("span", { class: "cp-flag" }, " outside the limit") : null);
    /* invested against cash, with a tick where the cash limit starts (one figure outside its limit is flagged, not hidden:
       weights drift between decisions) */
    const bar = h("div", { class: "cp-inv" },
      h("p", {}, h("span", {}, "Invested ", h("b", {}, wp(1 - cash))),
        h("span", {}, "Cash ", h("b", {}, wp(cash)), cm != null ? h("span", { class: "cp-lim" }, ` · limit ${p0(cm)}`) : null,
          flag(cm != null && cash > cm + 0.0005))),
      h("div", { class: "cp-inv-bar", role: "img", "aria-label": barLabel },
        h("span", { class: "inv", style: `flex:${Math.max(0, 1 - cash)}` }), h("span", { class: "cash", style: `flex:${Math.max(0, cash)}` }),
        cm != null ? h("i", { class: "tick", style: `left:calc(${(1 - cm) * 100}% - 1px)`, title: `cash limit ${p0(cm)}` }) : null));
    const scale = Math.max(top, ...ix.values());
    const head = vs && secs.length ? h("div", { class: "cp-secs-h", "aria-hidden": "true" }, h("span", {}, "Sector"),
      h("span", {}, "Claude"), h("span", { title: ixAbout }, "S&P 500")) : null;
    const list = secs.length ? h("ul", { class: `cp-secs${vs ? " vs" : ""}`, "aria-label": vs ? "Weight by sector, Claude and the S&P 500" : "Weight by sector" },
      secs.map((x) => {
        const k = plural(count[x.sector] || 0, "stock");
        const iw = ix.get(x.sector);
        const said = vs ? `; S&P 500 ${ok(iw) ? wp(iw) : "not listed"}` : "";
        return h("li", { title: `${x.sector}: ${k}, ${wp(x.weight)}${said}` },
          h("span", { class: "n" }, x.sector, h("span", { class: "sr-only" }, `, ${k}`)),
          h("span", { class: "cp-track", "aria-hidden": "true" }, h("i", { style: `width:${(x.weight / (vs ? scale : top)) * 100}%` }),
            vs && ok(iw) ? h("b", { class: "ix", style: `left:calc(${(iw / scale) * 100}% - 1px)` }) : null),
          h("span", { class: "w" }, wp(x.weight)),
          vs ? h("span", { class: "ixw" }, h("span", { class: "lbl" }, " S&P 500 "), ok(iw) ? wp(iw) : "—") : null);
      })) : note("No sectors yet.");
    const held = new Set(secs.map((x) => x.sector));
    const out = vs ? [...ix].filter(([k, w]) => !held.has(k) && w > 0) : [];
    /* from 1200px the short form (one line, so Recent fills below keeps its rows); the full list stays in the tooltip */
    const outList = out.map(([k, w]) => `${k} ${wp(w)}`).join(", ");
    const outSum = out.reduce((a, [, w]) => a + w, 0);
    const none = out.length ? h("p", { class: "cp-secs-out", title: `${ixAbout}. Not held: ${outList}.` },
      h("span", { class: "full" }, `Not held: ${outList}.`),
      h("span", { class: "short", "aria-hidden": "true" }, `Not held: ${out.length} ${out.length === 1 ? "sector" : "sectors"}, ${wp(outSum)} of the S&P 500.`)) : null;
    const hint = ok(lim.weight_max) ? h("p", { class: "cp-hint" },
      ok(lim.weight_min) ? `Per company: ${p0(lim.weight_min)} to ${p0(lim.weight_max)}` : `Per company: at most ${p0(lim.weight_max)}`,
      big ? [` (largest ${big.ticker} ${wp(big.weight)}`, flag(big.weight > lim.weight_max + 0.0005), ")"] : null) : null;
    return panel("alloc", { label, dot: live ? "ok" : "wait", title }, bar, head, list, none, hint);
  }

  /* ---------------------------------------------------------------- Recent fills (like a broker's time and sales) */
  function fillsPanel(D) {
    const ups = D.up ? D.up.updates || [] : null;
    const s = D.s || {};
    const title = "Recent fills";
    if (!ups) return panel("fills", { label: "Orders", dot: "bad", title }, failed(D.err.up));
    const fills = ups.flatMap((u) => u.fills || []);
    if (!fills.length) {
      const old = ups.some((u) => u.filled_on) && !ups.some((u) => Array.isArray(u.fills));
      return panel("fills", { label: "Orders", dot: "wait", title },
        note(old ? "The fills are listed from the next update of this page." : "No fills yet.", "Orders fill at the US closing auction."));
    }
    const byDay = new Map();
    for (const f of fills) byDay.set(f.date, [...(byDay.get(f.date) || []), f]);
    const days = [...byDay.keys()].sort().reverse();
    const where = (list) => (list.every((f) => f.venue) ? "Interactive Brokers demo" : list.some((f) => f.venue) ? "partly simulated" : "simulated");
    const tbl = h("table", { class: "cp-ft" }, h("caption", { class: "sr-only" }, "Fills, newest first, by day"),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Stock"), h("th", { scope: "col" }, "Side"),
        h("th", { scope: "col", class: "num" }, "Shares"), h("th", { scope: "col", class: "num" }, "Price"))),
      days.map((d) => h("tbody", {}, h("tr", { class: "g" }, h("th", { colspan: 4, scope: "rowgroup" }, wday(d),
        h("span", { title: byDay.get(d).every((f) => f.venue) ? null : "Priced at the Lang & Schwarz session end: the broker could not be reached" },
          ` · ${where(byDay.get(d))}`))),
        byDay.get(d).map((f) => h("tr", {}, h("td", {}, h("b", {}, f.ticker)), h("td", { class: f.side === "sell" ? "sell" : "buy" }, f.side === "sell" ? "Sell" : "Buy"),
          h("td", { class: "num" }, fmt.n4.format(f.shares)), h("td", { class: "num", title: ok(f.price) ? `$${f.price}` : null }, m$(f.price)))))));
    const ibCount = fills.filter((f) => f.venue).length;
    const label = ibCount === fills.length ? `${plural(fills.length, "order")} · Interactive Brokers demo`
      : `${plural(fills.length, "order")} · ${ibCount} at Interactive Brokers demo`;
    const foot = ok(s.fees_paid) ? h("p", { class: "cp-hint" }, `Commissions ${m$(s.fees_paid)} on ${plural(s.orders || fills.length, "order")}`) : null;
    return panel("fills", { label, title }, h("div", { class: "cp-scroll" }, h("div", { class: "cp-ft-in" }, tbl)), foot);
  }

  /* ---------------------------------------------------------------- How it works (a dialog: the five steps, top to bottom,
     then the dated changes of method; the rules never change without a new version) */
  /* [ISO date, the owner's words, verbatim] newest first */
  const METHOD_CHANGES = [
    ["2026-11-17", "17 Nov 2026: from the decision of 18 Nov, Claude's brief adds company results and valuations from SEC filings, " +
      "the S&P 500's sector weights, each holding's thesis and its result since purchase, Claude's own record, and a group of " +
      "candidates chosen on company figures (growing, profitable companies with high free cash flow for their price) besides " +
      "those chosen on price trends. Claude also states, for each holding, what would make it sell, and names the candidates it " +
      "looked at and passed on. The rules (v3) are unchanged."],
  ];
  function howBody(D) {
    const s = D.s || {}, lim = limitsOf(s);
    const v = s.rules_version || 3;
    const searches = ok(lim.web_searches_max) ? `up to ${lim.web_searches_max} web searches` : "a few web searches";
    const STEPS = [
      ["Brief", "S&P 500 prices, trends and sector moves condensed into candidates; from 18 Nov also company results filed with " +
        "the US Securities and Exchange Commission (SEC).", "Python · Lang & Schwarz prices · SEC filings"],
      ["Claude decides", `Target weights, with a thesis and the risks for each stock; ${searches}.`, "Claude Code · Wed evening, Sat morning"],
      ["Rules check", `Rules v${v} enforced: fixed or rejected, then fingerprinted before any order exists.`, "the program"],
      ["Orders at Interactive Brokers (demo)", "Market-on-close, filled at the US closing auction.", "Thursday or Monday · 20:15 Berlin"],
      ["Booked and published", "Fills booked at the broker's prices; each decision published with its SHA-256 fingerprint.",
        "fills 22:20 · valued ~23:00 Berlin"],
    ];
    /* role=list: Safari drops the list semantics of an unstyled list; the step's number is in its position */
    const steps = h("ol", { class: "cp-steps", role: "list" }, STEPS.map(([t, x, m], i) => h("li", {},
      h("span", { class: "n", "aria-hidden": "true" }, String(i + 1)),
      h("div", { class: "s" }, h("b", {}, t), h("span", { class: "t" }, x), h("span", { class: "m" }, m)))));
    /* Rules opens in place of this dialog (one at a time); closing it gives focus back to what opened How it works */
    const rules = h("a", { class: "cp-btn pri", href: RULES_HREF, "aria-haspopup": "dialog" }, `Rules v${v}`);
    /* each entry's text is the owner's, whole: its date is set apart only by its markup */
    const changes = h("section", { class: "cp-mlog", "aria-labelledby": "cp-mlog-t" }, h("h3", { id: "cp-mlog-t" }, "Method changes"),
      h("ul", { role: "list" }, METHOD_CHANGES.map(([iso, text]) => {
        const at = text.indexOf(": ");
        return h("li", {}, h("time", { datetime: iso }, text.slice(0, at)), text.slice(at));
      })));
    return [
      h("p", { class: "cp-dlg-lead" }, "Twice a week · times are Berlin time"),
      steps,
      h("p", { class: "cp-hint" }, "A Wednesday decision trades on Thursday, a Saturday decision on Monday. If the broker cannot be " +
        "reached, a fill is simulated at that day's Lang & Schwarz session end (mid ± 0.05%, $1 per order) and marked as simulated."),
      changes,
      h("p", { class: "cp-dlg-act" }, rules),
    ];
  }

  /* ---------------------------------------------------------------- Verify (a dialog). Recompute marks the decisions'
     rows on the page (fp-ok, fp-bad) and says how many match */
  function verifyBody(D) {
    const s = D.s || {}, ups = (D.up && D.up.updates) || [];
    const v = s.rules_version || 3;
    const checks = ups.filter((u) => u.fingerprinted && u.sha256).map((u) => [u.fingerprinted, u.sha256, u.date]);
    if (s.rules_json && s.rules_hash) checks.push([s.rules_json, s.rules_hash, "rules"]);
    const can = !!(window.crypto && crypto.subtle) && checks.length > 0;
    const status = h("span", { class: "cp-vstat", role: "status" }, can ? `${plural(checks.length, "fingerprint")} to check` : "");
    const btn = can ? h("button", { class: "cp-btn pri", type: "button" }, "Recompute here") : null;
    if (btn) {
      /* once only. aria-disabled, not disabled: a disabled button would drop the focus to the page, outside the dialog;
         this one keeps it, and the status line (role=status) reads the result */
      btn.addEventListener("click", async () => {
        if (btn.getAttribute("aria-disabled") === "true") return;
        btn.setAttribute("aria-disabled", "true");
        let good = 0;
        for (const [text, want, what] of checks) {
          const same = (await sha256(text)) === want;
          good += same ? 1 : 0;
          const r = DEC && DEC.rows.get(what);
          if (r) r.tr.classList.add(same ? "fp-ok" : "fp-bad");
        }
        status.textContent = `${good} of ${checks.length} recomputed in this browser match the published ones`;
        btn.textContent = "Recomputed";
      });
    }
    const st = window.BussolaStatic;
    const built = st && st.index && st.index.built ? berlinStamp(st.index.built, true) : null;
    const files = [["summary", D.s], ["holdings", D.hd], ["decisions", D.up], ["curve", D.cv]];
    const row = (k, ...v2) => h("div", { class: "cp-vrow" }, h("dt", {}, k), h("dd", {}, ...v2));
    const how = h("details", { class: "cp-how" }, h("summary", {}, "How to check a fingerprint"),
      h("div", { class: "cp-how-b" },
        h("p", {}, "A SHA-256 fingerprint is a 64-character code computed from a piece of data; changing one character of the " +
          "data changes the whole code. Each decision's is computed from its exact text in decisions.json (its date, target " +
          "weights and Claude's full answer), the rules' from their text in summary.json. In a terminal:"),
        h("pre", {}, h("code", {}, "jq -j '.updates[0].fingerprinted' decisions.json | shasum -a 256")),
        h("p", {}, "To check that a decision was not edited after the fact, compare its fingerprint with the same decision in " +
          "earlier versions of this site on GitHub.")));
    /* the snapshot's time on the public site (the local app is live: no line) */
    return [
      built ? h("p", { class: "cp-dlg-lead" }, `Snapshot ${built}`) : null,
      h("dl", { class: "cp-vlist" },
        row(`Rules v${v}`, s.rules_fixed_on ? h("span", { class: "cp-muted2" }, `fixed ${day(s.rules_fixed_on)} `) : null,
          fingerprint(s.rules_hash, "the rules", { long: true })),
        row("Fingerprints", btn, status),
        row("History", extLink(HISTORY_URL, "Every version on GitHub ↗")),
        row("Data", h("span", { class: "cp-dl" }, files.map(([name, d]) => h("button", {
          class: "cp-btn sm", type: "button", disabled: d ? null : true, onclick: () => download(name, d, s.as_of),
        }, `${name}.json`))))),
      how,
    ];
  }

  /* ---------------------------------------------------------------- Track record (a dialog, 17 Nov 2026): Claude's whole
     record of trades in one place, for a reader coming from the owner's CV. At the top how many trades helped against the
     S&P 500 ETF and how many did not, their median effect, the best and the worst trade, and what the effect is; then
     every trade under its decision, newest first, each decision's heading a link to it in the Decisions panel. Built
     from the decisions' own scorecards (cp_api _scorecard): the same effect as in each decision's table (effectOf) */
  function median(xs) {
    const v = [...xs].sort((a, b) => a - b), m = Math.floor(v.length / 2);
    return !v.length ? null : v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  /* a decision's heading: this dialog closes and that decision opens in the Decisions panel, in view, its row focused
     (not what opened the dialog: dlgBack is let go first) */
  function toDecision(date) {
    dlgBack = null;
    const d = openOne();
    if (d) d.close();
    openDecision(date);
  }
  function trackBody(D) {
    const ups = D.up ? D.up.updates || [] : null;
    if (!ups) return [failed(D.err.up)];
    const groups = ups.map((u) => ({ u, rows: (u.scorecard || []).filter((x) => x && x.ticker) })).filter((g) => g.rows.length);
    if (!groups.length) {
      /* fills without their scorecard: an app not restarted since 17 Nov 2026 */
      return [ups.some((u) => (u.fills || []).length) ? note("The track record is listed from the next update of this page.")
        : note("No trades yet.", "Each trade is listed here from its fill, against the S&P 500 ETF over the same days.")];
    }
    const names = namesOf(D);
    const all = groups.flatMap((g) => g.rows);
    const meas = all.filter((x) => ok(effectOf(x)));
    const up = meas.filter((x) => effectOf(x) > 0).length;
    const wait = all.length - meas.length;
    const first = all.map((x) => x.date).filter(Boolean).sort()[0];
    const to = meas.map((x) => x.to).filter(Boolean).sort().pop();
    /* "bought 19 Oct", the date whole where the line wraps (phones): a no-break space */
    const what = (x) => `${x.side === "sell" ? "sold" : "bought"}${x.date ? ` ${dayShort(x.date).replace(" ", "\u00a0")}` : ""}`;
    const sum = h("p", { class: "cp-trk-sum" }, h("b", {}, plural(all.length, "trade")), first ? ` since ${day(first)}` : "",
      meas.length ? [": ", h("b", {}, `${up} helped`), " against the ETF, ", h("b", {}, `${meas.length - up} did not`)] : null,
      wait ? `${meas.length ? "," : ":"} ${wait} not measured yet` : "", ".");
    /* the median, the best and the worst: from two measured trades (one would be all three) */
    let figs = null;
    if (meas.length > 1) {
      const by = [...meas].sort((a, b) => effectOf(b) - effectOf(a));
      const best = by[0], worst = by[by.length - 1];
      const kv = (k, g, sub) => h("div", {}, h("dt", {}, k),
        h("dd", {}, h("b", { class: tone(g) || null }, ptsTxt(g, fmt.n1)), h("span", {}, sub)));
      figs = h("dl", { class: "cp-trk-k" },
        kv("Median effect", median(meas.map(effectOf)), `of ${plural(meas.length, "trade")}`),
        kv("Best trade", effectOf(best), `${best.ticker}, ${what(best)}`),
        kv("Worst trade", effectOf(worst), `${worst.ticker}, ${what(worst)}`));
    }
    const def = h("p", { class: "cp-trk-x" }, "Effect: what a trade gained against the ETF over the same days, in percentage " +
      `points, from its fill to the last valuation${to ? ` (${dayShort(to)})` : ""}, before commissions; for a sale it is ` +
      "turned around, so a share that did worse than the ETF after it was sold makes the sale positive. Each trade counts " +
      "on its own here; the Portfolio panel counts the holdings, after commissions, so its figure can differ.");
    const num = (x, f) => h("td", { class: `num${tone(x) ? ` ${tone(x)}` : ""}` }, f(x));
    const na = (title) => h("td", { class: "num cp-na", title }, "—");
    const row = (x) => {
      const g = effectOf(x);
      return h("tr", {}, h("td", { class: "d" }, x.date ? dayShort(x.date) : "—"),
        h("th", { scope: "row", title: names[x.ticker] || null }, x.ticker),
        h("td", { class: "sd" }, x.side === "sell" ? "Sold" : "Bought"),
        h("td", { class: "num px" }, m$(x.price)),
        ok(x.change) ? num(x.change, sp1) : na("No valuation after this fill yet"),
        ok(x.change) ? num(x.etf, sp1) : na(null),
        ok(g) ? h("td", { class: `num g${tone(g) ? ` ${tone(g)}` : ""}` }, ptsTxt(g, fmt.n1),
          x.to && to && x.to !== to ? h("small", {}, ` to ${dayShort(x.to)}`) : null) : na(null));
    };
    const cols = [["Filled", "d"], ["Stock"], ["Side"], ["Fill price", "num px"], ["Price since", "num"], ["ETF", "num"],
      ["Effect", "num", "What the trade gained against the ETF, in points"]];
    const tbl = h("table", { class: "cp-trk" },
      h("caption", { class: "sr-only" }, "Every trade, newest first, under its decision: the fill, the price change since, the " +
        "S&P 500 ETF over the same days and the effect in points"),
      h("thead", {}, h("tr", {}, cols.map(([t, cls, title]) => h("th", { scope: "col", class: cls || null, title: title || null }, t)))),
      groups.map(({ u, rows }) => {
        const when = wday((u.decided_at && berlinDate(u.decided_at)) || u.date);
        return h("tbody", {}, h("tr", { class: "g" }, h("th", { colspan: cols.length, scope: "rowgroup" },
          h("button", { class: "cp-link", type: "button", title: "Close this and open the decision in the Decisions panel",
            onclick: () => toDecision(u.date) }, `Decision of ${when}`, h("span", { class: "sr-only" }, ", open it in the Decisions panel")),
          h("span", {}, ` · ${plural(rows.length, "trade")}`))),
        [...rows].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).map(row));
      }));
    return [
      h("p", { class: "cp-dlg-lead" }, "Every stock Claude bought or sold, each against the S&P 500 exchange-traded fund (ETF) " +
        "over the same days."),
      sum, figs, def, h("div", { class: "cp-trk-w" }, tbl),
    ];
  }

  /* ---------------------------------------------------------------- dialogs: How it works, Verify, Track record, Rules v3,
     Legal. One open at a time: a dialog opened from another (Rules from How it works) takes its place, and when the last
     one closes (Esc, the ✕, a click on the backdrop) focus goes back to what opened the first */
  const DLG = {};                                // the dialogs by name ("how", "verify", "track", "rules", "legal")
  let dlgBack = null;                            // what had focus when the first dialog opened: it gets it back at the end
  const openOne = () => Object.values(DLG).find((x) => x.open) || null;
  function makeDialog(id, title, body) {
    const d = h("dialog", { class: "cp-dialog", id: `cp-dlg-${id}`, "aria-labelledby": `cp-dlg-${id}-t` });
    const close = h("button", { class: "cp-x", type: "button", "aria-label": "Close" }, xIc());
    close.addEventListener("click", () => d.close());
    d.append(h("div", { class: "cp-dlg-in" }, h("header", { class: "cp-dlg-h" }, h("h2", { id: `cp-dlg-${id}-t` }, title), close),
      h("div", { class: "cp-dlg-b" }, body)),
      h("p", { class: "sr-only cp-dlg-live", "aria-live": "polite" }));   // announce() writes here while the dialog is open
    /* a click on the backdrop (the dialog element itself, around its box) closes it; a press that began inside the box,
       such as selecting text and letting go outside, does not */
    let downOut = false;
    d.addEventListener("pointerdown", (e) => { downOut = e.target === d; });
    d.addEventListener("click", (e) => { if (e.target === d && downOut) d.close(); downOut = false; });
    /* "close" comes after the dialog has closed (a queued event): when another dialog has opened in its place, focus
       stays there */
    d.addEventListener("close", () => {
      if (openOne()) return;
      const back = dlgBack;
      dlgBack = null;
      if (back && back.isConnected && typeof back.focus === "function") back.focus({ preventScroll: true });
    });
    document.body.append(d);
    return d;
  }
  function dropDialogs() {
    Object.keys(DLG).forEach((k) => {
      if (DLG[k].open) DLG[k].close();
      DLG[k].remove();
      delete DLG[k];
    });
    dlgBack = null;
  }
  function dialogs(D) {
    dropDialogs();
    const s = D.s;
    let rules;
    if (!s) rules = failed(D.err.s);
    else {
      const mc = limitsOf(s).min_change;
      rules = [
        h("p", { class: "cp-dlg-lead" }, `${s.rules_fixed_on ? `Fixed on ${day(s.rules_fixed_on)}, before the first trade. ` : ""}` +
          "Claude decides within these limits; the program fixes or rejects any decision that breaks them, and each fix is " +
          "listed with its decision."),
        h("ol", { class: "cp-rules" }, (s.rules || []).map((r) => h("li", {}, r))),
        ok(mc) ? h("p", {}, "Also applied at each decision: a held stock is traded only when its weight would change by at least " +
          `${fmt.n0.format(mc * 100)} percentage point${mc === 0.01 ? "" : "s"}. Between decisions, weights move with prices.`) : null,
        h("p", { class: "cp-dlg-fp" }, "Fingerprint (SHA-256) ", fingerprint(s.rules_hash, "the rules", { long: true })),
      ];
    }
    const ss = s || {};
    DLG.how = makeDialog("how", "How it works", howBody(D));
    DLG.verify = makeDialog("verify", "Verify", verifyBody(D));
    DLG.track = makeDialog("track", "Track record", trackBody(D));
    DLG.rules = makeDialog("rules", `Rules v${ss.rules_version || 3}`, rules);
    DLG.legal = makeDialog("legal", "Legal and sources", [
      h("p", {}, h("strong", {}, "Paper money · educational · not investment advice")),
      h("p", {}, LEGAL),
      h("p", {}, `Benchmark: ${ss.bench_name || "S&P 500 ETF"}. Charts: TradingView Lightweight Charts. Version history: `,
        extLink(HISTORY_URL, "GitHub ↗")),
      h("p", {}, "Rules fingerprint: ", fingerprint(ss.rules_hash, "the rules", { long: true })),
    ]);
  }
  function openDialog(which) {
    const d = DLG[which];
    if (!d || d.open) return;
    const cur = openOne();
    if (cur) cur.close();                        // one at a time: dlgBack still names what opened the first
    else {
      const a = document.activeElement;
      dlgBack = a && a !== document.body ? a : null;
    }
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
  }

  /* ---------------------------------------------------------------- loading state */
  function loading() {
    const sk = (area) => h("div", { class: `cp-panel cp-skel p-${area}` });
    return h("div", { class: "cp", "aria-busy": "true" }, h("p", { class: "sr-only", role: "status" }, "Loading the portfolio…"),
      h("div", { class: "cp-dash" }, sk("port"), sk("perf"), sk("hold"), sk("dec"), sk("risk"),
        h("div", { class: "cp-side" }, sk("alloc"), sk("fills"))));
  }

  /* ---------------------------------------------------------------- the page
     A link to #/cp in the page (the top bar's How it works, Verify and Track record, the footer's five links, the
     disclaimer's "Legal", the Rules button in How it works, the Portfolio panel's count of holdings ahead of the ETF) is
     handled here, without loading anything: ?open=how, verify, track, rules and legal open their dialog, anything else
     goes to the top. The address stays #/cp (replaceState: one page, no history entries). */
  /* the one-line disclaimer above the panels. The public page has its own band (#pub-disclaimer, written by publish.py);
     the local app gets the same markup here */
  const band = () => ($("pub-disclaimer") ? null : h("div", { class: "pub-disclaimer", role: "note", "aria-label": "Disclaimer" },
    h("p", {}, `${DISCLAIMER} `, h("span", { class: "nw" }, "· ", h("a", { href: LEGAL_HREF }, "Legal")))));
  const W = { obs: [], off: [] };                  // what render() wires up, undone by leave()
  let READY = false, WANT = null;
  function listen(target, type, fn, opt) {
    target.addEventListener(type, fn, opt);
    W.off.push(() => target.removeEventListener(type, fn, opt));
  }
  function cleanUrl() {
    if (location.hash !== "#/cp") history.replaceState(history.state, "", `${location.pathname}${location.search}#/cp`);
  }
  function go(q) {
    const open = q && q.get("open");
    if (DIALOGS.has(open)) openDialog(open);
    else window.scrollTo({ top: 0, behavior: still() ? "auto" : "smooth" });
  }
  function onAnchor(e) {
    const a = e.target.closest && e.target.closest('a[href^="#/cp"]');
    if (!a || !READY || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(new URLSearchParams(a.getAttribute("href").split("?")[1] || ""));
  }
  function wire() {
    listen(document, "click", onAnchor);
    /* the chart draws smaller markers below NARROW_CHART: redraw when a resize or rotation crosses it */
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

  Pages.cp = {
    title: "Claude Portfolio",
    async render(el, params) {
      READY = false;
      WANT = null;
      const who = author();
      document.title = who.name ? `Claude Portfolio · by ${who.name}` : "Claude Portfolio";
      byline();
      el.replaceChildren(...[band(), loading()].filter(Boolean));
      const keys = ["s", "hd", "up", "cv"];
      const [got, lg] = await Promise.all([Promise.allSettled(["/api/cp/summary", "/api/cp/holdings", "/api/cp/updates", "/api/cp/curve"].map((p) => api(p))),
        fetch("logos/index.json").then((r) => (r.ok ? r.json() : [])).catch(() => [])]);
      LOGOS = new Set(Array.isArray(lg) ? lg : []);
      if (!el.isConnected || Router.current !== "cp") return;
      const D = { err: {} };
      got.forEach((r, i) => {
        D[keys[i]] = r.status === "fulfilled" ? r.value : null;
        if (r.status !== "fulfilled") D.err[keys[i]] = r.reason;
      });
      statusPill(D.s);
      topPills(D.s);
      const dash = h("div", { class: "cp-dash" }, portPanel(D), perfPanel(D), holdPanel(D), decPanel(D), riskPanel(D),
        h("div", { class: "cp-side" }, allocPanel(D), fillsPanel(D)));
      el.replaceChildren(...[band(), h("div", { class: "cp" }, dash, h("p", { class: "sr-only", id: "cp-announce", "aria-live": "polite" }))]
        .filter(Boolean));
      dialogs(D);
      wire();
      drawChart();
      READY = true;
      cleanUrl();
      const q = WANT || params;                    // a dialog asked for while the data loaded (or in the address)
      WANT = null;
      if (q && DIALOGS.has(q.get("open"))) go(q);
    },
    /* the router calls this when only the part after #/cp? changes (a typed address, a link): no reload */
    update(params) {
      if (!READY) { WANT = params; return true; }   // still loading: render() acts on it when it is done
      cleanUrl();
      go(params);
      return true;
    },
    leave() {
      W.obs.forEach((o) => o.disconnect());
      W.off.forEach((f) => f());
      W.obs = [];
      W.off = [];
      dropDialogs();
      if (CH && CH.chart) dropChart(CH.chart);
      CH = null;
      DEC = null;
      READY = false;
      WANT = null;
      const pills = $("cp-pills");
      if (pills) { pills.hidden = true; pills.replaceChildren(); }
    },
  };
})();
