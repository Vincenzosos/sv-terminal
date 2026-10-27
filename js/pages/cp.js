/* Claude Portfolio (#/cp), the whole site since 17 Oct 2026: a paper portfolio of US shares whose target weights Claude
   sets twice a week. Numbers first: value against the S&P 500 ETF, the next orders or the holdings, sector mix, Claude's
   trade updates, the value chart; how it works and the legal text are folded at the bottom.
   Reads /api/cp/summary, /holdings, /updates, /curve (public, paper money only). */
(function () {
  const usd = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" });
  const usd0 = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 });
  const ok = (x) => x != null && Number.isFinite(x);
  const $u = (x, f = usd) => (ok(x) ? unsigned(x, f) : "—");
  const $s = (x, f = usd) => (ok(x) ? h("span", { class: tone(x) }, sign(x, f)) : "—");
  const pc = (x, f = fmt.p1) => (ok(x) ? h("span", { class: tone(x) }, sign(x, f)) : "—");
  const w = (x) => (ok(x) ? unsigned(x, fmt.p1) : "—");
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const wday = (s) => (s ? `${WD[new Date(`${s}T12:00:00Z`).getUTCDay()]} ${dayShort(s)}` : "—");
  const clip = (t, n = 150) => (t && t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t || "");

  /* the next Lang & Schwarz session end (about 23:00 Berlin, weekdays): today until 23:00, else the next weekday */
  function nextSession() {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    const d = new Date(now);
    if (now.getHours() >= 23) d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  /* a ticker badge in place of a logo: the letters on a colour picked from the ticker */
  function tk(t) {
    let hsh = 0;
    for (const c of String(t)) hsh = (hsh * 31 + c.charCodeAt(0)) % 360;
    return h("span", { class: "cp-tk", style: `--h:${hsh}`, "aria-hidden": "true" }, String(t).slice(0, 4));
  }
  const company = (r, withThesis = true) => h("div", { class: "cp-co" }, tk(r.ticker),
    h("div", {}, h("div", {}, h("b", {}, r.ticker), " ", h("span", { class: "muted" }, r.name || "")),
      withThesis && r.thesis ? h("div", { class: "cp-why", title: [r.thesis, r.risks && `Risks: ${r.risks}`].filter(Boolean).join("\n") }, clip(r.thesis)) : null));

  function kpiRow(s) {
    const live = s.state === "live";
    const diff = live && ok(s.return) && ok(s.bench_return) ? s.return - s.bench_return : null;
    if (!live) {
      return kpiStrip([
        { label: "Value", tier: "hero", value: $u(s.capital, usd0), detail: h("span", { class: "muted" }, "paper money, not invested yet") },
        { label: "First trades", tier: "major", value: s.pending ? wday(nextSession()) : "—",
          detail: h("span", { class: "muted" }, s.pending ? `${s.pending.names} companies · about 23:00 Berlin` : "after Claude's first decision") },
        { label: "Next decision", value: wday(s.next_decision), detail: h("span", { class: "muted" }, "Wednesday evening or Saturday morning") },
      ]);
    }
    return kpiStrip([
      { label: "Value", tier: "hero", value: $u(s.value), detail: h("span", {}, pc(s.return, fmt.p2), ` since ${day(s.start)}`) },
      { label: "S&P 500 ETF", tier: "major", value: pc(s.bench_return, fmt.p2), detail: h("span", { class: "muted" }, `same days, same ${$u(s.capital, usd0)}`) },
      { label: "Difference", value: ok(diff) ? pc(diff, fmt.p2) : "—", detail: h("span", { class: "muted" }, "portfolio minus ETF") },
      { label: "After tax if sold", value: $u(s.after_tax_value), detail: h("span", { class: "muted" }, `26% tax: ${$u(s.tax_if_sold)}`) },
      { label: "Next decision", value: wday(s.next_decision), detail: h("span", { class: "muted" }, `${s.positions} companies · cash ${w(s.cash_weight)}`) },
    ]);
  }

  function pendingList(p) {
    return h("div", {},
      h("p", { class: "muted small" }, `Decided on ${day(p.decided_on)} prices · bought at the next session end, about 23:00 Berlin.`),
      table({
        cols: [
          { key: "co", label: "Company", lead: true, fmt: (r) => company(r) },
          { key: "sector", label: "Sector", hideSm: true, fmt: (r) => h("span", { class: "muted" }, r.sector || "—") },
          { key: "weight", label: "Weight", num: true, fmt: (r) => h("span", { class: "cp-wt" }, h("i", { style: `width:${Math.round((r.weight || 0) * 600)}px` }), w(r.weight)) },
        ],
        rows: p.targets,
        foot: { co: h("b", {}, "Cash"), weight: w(p.cash) },
      }));
  }

  function holdingsTable(hd) {
    return table({
      cols: [
        { key: "co", label: "Company", lead: true, fmt: (r) => company(r) },
        { key: "weight", label: "Weight", num: true, fmt: (r) => w(r.weight) },
        { key: "paid", label: "Paid", num: true, hideSm: true, fmt: (r) => $u(r.paid) },
        { key: "value", label: "Value now", num: true, hideSm: true, fmt: (r) => $u(r.value) },
        { key: "gain", label: "Gain", num: true, fmt: (r) => h("span", {}, $s(r.gain), h("br"), h("small", {}, pc(r.gain_pct))) },
        { key: "since", label: "Since", hideSm: true, fmt: (r) => (r.since ? dayShort(r.since) : "—") },
      ],
      rows: hd.rows,
      foot: { co: h("b", {}, "Cash"), value: $u(hd.cash) },
    });
  }

  function sectorBars(list) {
    if (!list || !list.length) return framed("No holdings yet.");
    return h("div", { class: "cp-sect" }, list.map((x) => h("div", { class: "cp-sect-row" },
      h("span", {}, x.sector), h("span", { class: "cp-bar" }, h("i", { style: `width:${Math.min(100, x.weight * 100 / Math.max(...list.map((y) => y.weight)))}%` })),
      h("b", {}, w(x.weight)))));
  }

  function change(x, kind) {
    const from = kind === "new" ? 0 : x.from;
    const to = kind === "closed" ? 0 : x.to;
    return h("li", { class: `cp-chg ${kind}`, title: x.thesis || null }, tk(x.ticker), h("b", {}, x.ticker),
      h("span", { class: "muted" }, ` ${w(from)} → `), h("b", {}, w(to)));
  }

  function updateCard(u) {
    const st = u.pending ? badge("Trades at the next session end", "paper") : u.filled_on ? badge(`Traded ${dayShort(u.filled_on)}${u.venue ? " at Interactive Brokers (demo)" : ""}`, "ok")
      : u.status === "ok" ? badge("Decided", "") : badge("Rejected by the rules", "warn");
    const lists = [["New", "new", u.new], ["Closed", "closed", u.closed], ["Resized", "resized", u.resized]]
      .filter(([, , xs]) => xs && xs.length)
      .map(([label, kind, xs]) => h("div", { class: "cp-chgs" }, h("span", { class: "cp-chg-h" }, label), h("ul", {}, xs.map((x) => change(x, kind)))));
    return h("article", { class: "cp-update" },
      h("header", {}, h("span", { class: "cp-claude" }, "Claude"), h("b", {}, wday(u.date)), st),
      u.alert ? h("p", { class: "cp-alert" }, `“${prose(u.alert)}”`) : h("p", { class: "muted" }, u.reason || "No readable answer this time; the portfolio stayed as it was."),
      ...lists,
      u.unchanged > 0 ? h("p", { class: "muted small" }, `${u.unchanged} unchanged`) : null,
      u.sha256 ? h("p", { class: "cp-proof", title: "Fingerprint (SHA-256) of this decision: date, target weights and Claude's whole answer, published with the decision, before the trades." },
        `decided ${u.decided_at ? `${dayShort(u.decided_at)} ${u.decided_at.slice(11, 16)} UTC` : ""} · #${u.sha256.slice(0, 12)}`) : null,
      u.repairs && u.repairs.length ? h("details", { class: "cp-rep" }, h("summary", {}, `${u.repairs.length} rule fix${u.repairs.length > 1 ? "es" : ""}`),
        h("ul", {}, u.repairs.map((r) => h("li", {}, r)))) : null);
  }

  function chart(el, cv) {
    const pts = cv.points || [];
    if (pts.length < 2) { el.replaceChildren(framed("The chart starts after the second session end with holdings.")); return; }
    const c = makeChart(el, { euro: false });
    if (!c) return;
    areaSeries(c, css("--s1")).setData(pts.map(([d, v]) => ({ time: d, value: v })));
    lineSeries(c, css("--bench-1")).setData(pts.filter(([, , x]) => ok(x)).map(([d, , x]) => ({ time: d, value: x })));
    c.timeScale().fitContent();
  }

  function trackRecord(st) {
    if (!st.sessions || st.sessions < 5) return framed("Statistics start after 5 sessions with holdings.", "Return, volatility, worst fall and more, against the S&P 500 ETF.");
    const rows = [["Sessions", String(st.sessions)], ["Return", pc(st.return, fmt.p2)], ["S&P 500 ETF", pc(st.bench_return, fmt.p2)],
      ["Volatility (yearly)", w(st.volatility)], ["Worst fall", pc(st.max_drawdown, fmt.p2)], ["Best day", pc(st.best_day, fmt.p2)],
      ["Worst day", pc(st.worst_day, fmt.p2)], ["Return / volatility", ok(st.sharpe_like) ? fmt.n2.format(st.sharpe_like) : "after 20 sessions"]];
    return h("dl", { class: "kv cp-kv" }, rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
  }

  const HOW = [
    "Twice a week the program gathers the S&P 500's prices, trends and sector moves into a short brief.",
    "Claude reads it, may check a few news items, and sets the weight of each company, with its reasons.",
    "The program enforces the rules (below), then trades on paper at the next Lang & Schwarz session end.",
    "Prices are in US dollars; $1 per order and a small spread are charged, as at a real broker.",
    "Everything is published here: holdings, every trade update, the value against the S&P 500 ETF.",
  ];
  const LEGAL = "Paper money only: an educational experiment, not a financial service and not investment advice, not a " +
    "recommendation or solicitation to buy or sell any security. Past or simulated results do not predict future results. " +
    "Not affiliated with Anthropic; Claude is used as a tool. Prices: Lang & Schwarz indications, for personal use. " +
    "Member list: Wikipedia (CC BY-SA 4.0).";

  Pages.cp = {
    title: "Claude Portfolio",
    async render(el) {
      el.replaceChildren(skeleton(160));
      const [s, hd, up, cv] = await Promise.all(["/api/cp/summary", "/api/cp/holdings", "/api/cp/updates", "/api/cp/curve"].map((p) => api(p)));
      const wide = matchMedia("(min-width: 1100px)").matches;     // the wide layout: the chart fills its tall panel
      const box = h("div", { class: "chart-box", style: wide ? "height:100%;min-height:380px" : "height:260px" });
      const live = s.state === "live";
      const by = document.querySelector('meta[name="author"]')?.content;      // the public site's author line (publish.py)
      el.replaceChildren(
        pageHead("Claude Portfolio", `US stocks picked by Claude twice a week · paper money${by ? ` · by ${by}` : ""}`),
        kpiRow(s),
        h("div", { class: "cp-grid" },
        s.pending && !live ? section("next", "Claude's picks", pendingList(s.pending), { cls: "cp-table" }) : null,
        live ? section("holdings", "Holdings", holdingsTable(hd), { cls: "cp-table" }) : null,
        live && s.pending ? section("next", "Next trades", pendingList(s.pending), { fold: true }) : null,
        section("sectors", "Sector mix", sectorBars(s.sectors)),
        section("updates", "Trade updates", up.updates.length ? h("div", { class: "cp-feed" }, up.updates.map(updateCard))
          : framed("No decision yet.", `Next decision: ${wday(s.next_decision)}.`)),
        section("chart", "Value vs S&P 500 ETF", box, { note: legend([{ label: "Claude Portfolio", style: "area" }, { label: "S&P 500 ETF", style: "b1" }]) }),
        section("record", "Track record", trackRecord(cv.stats || {})),
        section("about", "How it works", h("div", {},
          h("ol", { class: "how-list" }, HOW.map((x) => h("li", {}, x))),
          h("h3", { class: "cp-h3" }, "Rules"), h("ul", { class: "how-list plain" }, s.rules.map((r) => h("li", {}, r))),
          h("h3", { class: "cp-h3" }, "Legal"), h("p", { class: "muted small" }, LEGAL)), { fold: true })),
      );
      chart(box, cv);
    },
  };
})();
