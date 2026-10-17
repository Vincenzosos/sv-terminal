"use strict";
/* How it works (#/about): public, paper money only. Short on purpose. In the reading order of a retail investor: what the
   Trading Lab is, its rules, what it has cost, whether it is any good yet (the ten tests fixed in advance), its limits,
   and then collapsed "Details" sections that draw the full detail views (league, scorecard, method and reading list,
   journal, costs, model, robustness, data quality) only when a reader opens them, and the full legal text ("Legal").
   Every figure comes from /api/lab/* ; the words are facts, never advice. */

/* the ten registered tests, by their registered code: [what it checks in a few words, the full sentence for the tooltip]
   (the thresholds that change with the season are read from the API) */
const HOW_TESTS = {
  LENGTH: (c) => [`${U_int((c.threshold || {}).sessions ?? 250)}+ live sessions, enough trades`, `Enough live evidence: at least ${U_int((c.threshold || {}).sessions ?? 250)} live sessions (about a year) and enough closed trades.`],
  OPS: () => ["Ran properly: on-time prices, checks matched", "The lab ran properly: prices recorded on time, the daily checks matched, no open data problem."],
  SIGNIF: (c, r) => { const t = r && r.t_hurdle ? (Math.floor(r.t_hurdle * 1000) / 1000).toFixed(3) : "3"; return [`Gain too big to be luck (t ≥ ${t})`, `The gain over the market is too big to be luck: it passes a strict statistical test (t of at least ${t}).`]; },
  BASE: () => ["Beats the ETF and random picks", "It does better than simple choices: it made money after tax, and did better for its risk than holding the Europe ETF or picking shares at random."],
  DEFLATE: (c, r) => [`Holds after ${r && r.dsr && r.dsr.n_trials ? r.dsr.n_trials : "all"} trials (DSR ≥ 0.95)`, `It still looks good after allowing for the ${r && r.dsr && r.dsr.n_trials ? r.dsr.n_trials : "many"} configurations tried (a deflated Sharpe ratio of at least 0.95).`],
  PBO: () => ["Not overfitted (PBO 5% or less)", "The league is not just fitting the past: the chance that the strategy with the best history does worse than average later is 5% or less."],
  ROBUST: () => ["Survives stress tests", "It survives stress tests: shuffled signals, higher costs, orders one session late, and each half of the history on its own."],
  STOP: () => ["Stop rule never fired", "The stop rule never fired: no warning about unusual losses in the last 120 live sessions."],
  COSTS: () => ["Profits at measured spreads", "It still makes money at the spreads actually measured, and when filled by hand."],
  RISK: () => ["Drawdown under 15%, day under 5%", "Risk stayed contained: never more than 15% below its top, and never more than 5% lost in one session."],
};
const U_int = (x) => (x == null ? "—" : fmt.n0.format(x));

/* the Details sections: [id, title, what is inside (tooltip), LabViews key] */
const HOW_DETAILS = [
  ["league", "Strategies", "The full league: live, validation (2016 to the live start) and design windows, the curve and trades of each strategy.", "league"],
  ["scorecard-full", "Scorecard in full", "Each of the ten tests with its measured value, the significance path and the luck band.", "ready"],
  ["method", "Method and sources", "The registered rules word for word: clocks, features, learners, costs, tax, the trial ledger and the research.", "rules"],
  ["journal", "Session journal", "What happened, session by session, written from fixed templates.", "journal"],
  ["costs-full", "Cost ledger", "Fees, spreads and transaction taxes paid, measured spreads, the hand-execution check, the tax ledger per book.", "costs"],
  ["model", "Model learning", "The forecasts of the learners, measured only on results not yet known when they forecast.", "learn"],
  ["robustness", "Robustness drills", "Resampled histories, placebos, higher costs and late fills.", "practice"],
  ["data", "Data quality", "Recordings, session-end prices, requests to Lang & Schwarz, flags.", "data"],
];

/* the full legal text: the only place it lives. Every page carries the one-line version and a "More" link here. */
const HOW_LEGAL = {
  lab: "Paper money only. An educational training exercise run by an AI-designed model. Not a financial service, not investment advice, not a recommendation or solicitation to buy or sell any security. The owner provides no investment services. Simulated results do not predict future results. Backtests use today's index members (survivorship bias) and were designed after reading the research; only the live record since the registration date is out of sample.",
  portfolio: "My Portfolio is the owner's own portfolio. It shows facts and arithmetic about what the owner holds. It knows nothing about anyone's situation or how much risk they can take, and it never tells anyone what to buy or sell. Past returns do not predict future ones.",
  sources: "Live quotes: Lang & Schwarz Exchange, indicative, for personal use; they can differ slightly from the Trade Republic app. Fund facts: issuers' factsheets, KIDs and published holdings, with their dates. Headlines: GDELT Project (gdeltproject.org) and central-bank feeds. Charts: TradingView Lightweight Charts. The owner's holdings, amounts and files stay on the owner's computer; the headline search sends GDELT the names of the funds held, nothing else.",
  snapshot: "This is a public, read-only snapshot of SV Terminal, a personal app that runs on its owner's computer. It places no orders and has no link to Trade Republic or any other broker. My Portfolio is the owner's real money and is published only encrypted (AES-256-GCM), opened in the browser with the owner's code. Snapshots: about every 30 minutes 07:30–23:00 Berlin on weekdays while the owner's computer runs, and after the lab's nightly step.",
};

const HOW = { sum: null };

Pages.about = {
  title: "How it works",
  async render(el, params) {
    const U = LabUI;
    U.cleanup();
    const t = guard("about-page");
    const alive = () => t() && Router.current === "about";
    el.append(pageHead(["How it works", "rules, costs, record"]));
    const wait = U.loading();
    el.append(wait);
    const [sum, rules, ready, bk] = await Promise.all([U.get("/api/lab/summary", 20_000).catch(() => null), U.get("/api/lab/rules", 600_000).catch(() => null),
      U.get("/api/lab/ready").catch(() => null), U.get("/api/lab/book?id=MAIN&window=live").catch(() => null)]);
    if (!alive()) return;
    wait.remove();
    HOW.sum = sum;
    const running = sum && !["not_started", "building", "migrating", "protocol_mismatch"].includes(sum.state);
    const cs = (rules || {}).costs || {}, tax = ((rules || {}).tax || {}).params || {};
    const fee = U.ok(cs.fee_eur) ? cs.fee_eur : 1, hs = U.ok(cs.half_spread_bps) ? cs.half_spread_bps / 1e4 : 0.0005, rate = U.ok(tax.rate) ? tax.rate : 0.26;
    const ftt = cs.ftt || { IT: 0.004, FR: 0.004, ES: 0.002 };
    const champ = (sum || {}).champion || {};
    const fam = champ.family;
    const nd = sum ? labNextDecision(sum, fam) : {};
    const bullets = (list) => h("ul", { class: "how-list plain" }, list.map((x) => (Array.isArray(x) ? h("li", { title: x[1] }, x[0]) : h("li", {}, x))));

    /* ---------------------------------------------------------------- (a) what it is */
    el.append(section("what", "What it is", bullets([
      `${U.eur(10000, 0)} of pretend money.`,
      "Real Lang & Schwarz session-end prices.",
      ["Pays Trade Republic's costs and Italian tax.", `€${U.num(fee, 0)} an order, a ${U.pct(hs, 2)} spread on every fill, transaction taxes on some purchases and ${U.pct(rate, 0)} tax on gains.`],
      "Educational only. No orders, no advice."])));

    /* ---------------------------------------------------------------- (b) the rules */
    const tt = (g) => U.pct(ftt[g] ?? 0, 1);
    el.append(section("rules", "Rules", [
      h("div", { class: "how-main", title: champ.id && U.desc(champ.id) ? U.desc(champ.id) : null },
        h("div", { class: "l" }, "Main book follows"),
        h("div", { class: "v" }, champ.id ? [h("b", {}, U.nm(champ.id, champ.name)), " ", h("span", { class: "lab-bid" }, champ.id), fam ? [" ", badge(U.famWord(fam), "paper")] : null] : "Cash: no strategy"),
        h("p", { class: "muted" }, [nd.at ? `next decision ${U.relIn(nd.at)}` : null, champ.since ? `since ${U.d(champ.since)}` : null].filter(Boolean).join(" · "))),
      h("ul", { class: "how-rules" }, [
        ["Order fee", `€${U.num(fee, 0)}`, "A share that is kept sends no order."],
        ["Spread", `${U.pct(hs, 2)} on every fill`, "Every fill is this much worse than the session-end mid price (an assumption; measured spreads are checked beside it)."],
        ["Transaction tax", `IT ${tt("IT")} · FR ${tt("FR")} · ES ${tt("ES")}`, "On purchases of Italian, French and Spanish shares."],
        ["Tax on gains", `${U.pct(rate, 0)}, withheld at sale`, "As an Italian broker does; a loss becomes a credit for the same year and the next four."],
        ["Shares", U.ok(cs.min_ticket_eur) ? `whole only, min €${U.num(cs.min_ticket_eur, 0)}` : "whole only", "No fractions of a share."],
        ["Fills", "next session end ≈23:00", "Orders fill at the next Lang & Schwarz session end, about 23:00 Berlin."],
        ["Cash", "earns 0%, no dividends", "Cash earns 0%; dividends are not credited to the share books."],
        ["Rule change", "new season, restart", "Any change starts a new season, which restarts the live record from €10,000."],
      ].map(([k, v, tip]) => h("li", { title: tip }, h("b", {}, k), " ", v)))]));

    /* ---------------------------------------------------------------- (c) costs so far */
    const ctd = (bk || {}).costs_to_date || {}, tx = (bk || {}).tax || {};
    const paid = (ctd.fee || 0) + (ctd.spread || 0) + (ctd.ftt || 0);
    const total = paid + (tx.withheld_total_eur || 0);
    const deferred = U.ok(tx.deferred_tax_eur) && tx.deferred_tax_eur > 0 ? `If everything were sold tonight, a further ${U.eur(tx.deferred_tax_eur)} of tax would be withheld: the after-tax figures already count it.` : null;
    const cells = [["Fees", ctd.fee, null, null], ["Spread", ctd.spread, null, null], ["Transaction tax", ctd.ftt, null, null],
      ["Tax withheld", tx.withheld_total_eur, null, deferred], ["Total", total, U.ok(total) ? `${U.pct(total / 10000, 2)} of €10,000` : null, null]];
    el.append(section("costs", "Costs so far", bk && U.ok(ctd.fee)
      ? h("div", { class: "tiles five" }, cells.map(([l, v, d, tip], i) => h("div", { class: `tile${i === 4 ? " total" : ""}`, title: tip }, h("div", { class: "l" }, l), h("div", { class: "v" }, eurFig(v || 0)), d ? h("div", { class: "d muted" }, d) : null)))
      : framed("No costs yet."),
    { hint: `The main book since the live start${sum && sum.live_start ? ` (${U.d(sum.live_start)})` : ""}.` }));

    /* ---------------------------------------------------------------- (d) is it any good yet? */
    const crit = (ready || {}).criteria || [];
    const nSt = (s) => crit.filter((c) => c.status === s).length;
    const verdict = ((ready || {}).time_to_evidence || {}).earliest_a1;
    el.append(section("scorecard", "Scorecard", crit.length ? [
      h("p", { class: "how-verdict", title: "Ten tests fixed before the first live result. Meeting all of them would not show that results will continue, and it would not be a recommendation." },
        h("b", {}, `${nSt("met")} of ${crit.length} met`), ` · ${nSt("fails")} fail · ${nSt("too_early")} too early`, verdict ? ` · earliest verdict ${U.d(verdict)}` : ""),
      h("ol", { class: "how-tests" }, crit.map((c) => {
        const st = U.status(c.status);
        const [short, long] = HOW_TESTS[c.code] ? HOW_TESTS[c.code](c, ready) : [c.title, c.title];
        return h("li", { class: `t-${c.status}`, title: c.status === "too_early" && c.earliest ? `${long} Earliest: ${U.d(c.earliest)}.` : long }, h("span", { class: "id" }, c.id), h("span", { class: "tx" }, short), st);
      }))]
      : framed("Scorecard not available yet.")));

    /* ---------------------------------------------------------------- (e) limits */
    const tHurdle = (rules || {}).t_hurdle ? (Math.floor(rules.t_hurdle * 1000) / 1000).toFixed(3) : "3";
    el.append(section("honesty", "Limits", bullets([
      ["Backtests use today's index members: flattering.", "Shares that dropped out of the indices are missing, which makes every backtest look better than it was."],
      [`${U_int((rules || {}).trials_n)} trials counted: live bar t ≥ ${tHurdle}.`, `Many strategies were tried, so the live result has to clear a higher bar (t of at least ${tHurdle} instead of the usual 2).`],
      [`Only the live record counts${sum && sum.live_start ? ` (from ${U.d(sum.live_start)})` : ""}.`, "Everything before is history the rules were designed on."],
      ["ETF book reinvests dividends; share books do not.", "The Europe ETF book reinvests its dividends; the share books get none."],
      ["Paper fills are easier than real fills.", "Paper fills at the session-end price are easier than real fills."]])));

    /* ---------------------------------------------------------------- (f) details, collapsed, drawn on demand; then the legal text */
    const W = (ready || {}).wording || {};
    const legal = h("details", { class: "how-det", "data-sec": "legal" }, h("summary", {}, h("b", {}, "Legal")),
      h("div", { class: "how-det-b how-legal" },
        h("p", {}, h("b", {}, "Trading Lab. "), HOW_LEGAL.lab),
        h("p", {}, h("b", {}, "My Portfolio. "), HOW_LEGAL.portfolio),
        h("p", {}, h("b", {}, "Sources and privacy. "), HOW_LEGAL.sources),
        U.pub ? h("p", {}, h("b", {}, "This snapshot. "), HOW_LEGAL.snapshot) : null,
        W.expectation ? h("blockquote", { class: "lab-quote" }, h("span", { class: "muted" }, "What the lab expects, as registered: "), U.cite(W.expectation, (rules || {}).evidence)) : null));
    const det = h("div", { class: "how-details" }, HOW_DETAILS.map(([id, title, line, view]) => {
      const body = h("div", { class: "how-det-b" });
      const d = h("details", { class: "how-det", "data-sec": id }, h("summary", { title: line }, h("b", {}, title)), body);
      d.addEventListener("toggle", () => { if (d.open && !body.dataset.loaded) { body.dataset.loaded = "1"; howDetail(body, view, new URLSearchParams(), running); } });
      return d;
    }), legal);
    el.append(section("details", "Details", det));
    if (params.get("open") === "all") det.querySelectorAll("details").forEach((d) => { d.open = true; });
    revealSection(params);
    U.src(sum);
  },
  leave() { LabUI.cleanup(); },
};

/* one detail view drawn into its <details>: the page head of the view is left out, its controls kept as a toolbar */
async function howDetail(box, view, params, running) {
  const U = LabUI;
  const fn = window.LabViews[view];
  box.replaceChildren();
  if (!fn) { box.append(framed("This detail is not available.")); return; }
  if (!running && view !== "rules") { box.append(framed("Available once the lab runs.")); return; }
  const t = guard(`how-${view}`);
  const ctx = {
    sum: HOW.sum || {}, sub: view, params, job: null,
    alive: () => t() && Router.current === "about" && box.isConnected,
    head: (...actions) => { const a = actions.flat(Infinity).filter(Boolean); return a.length ? [h("div", { class: "how-tools" }, a)] : []; },
    go: (p) => howDetail(box, view, new URLSearchParams(p), running),
  };
  const wait = h("div", { class: "lab-loading" }, skeleton(96));
  try { await fn(box, ctx, wait); }
  catch (e) { console.error(e); if (ctx.alive()) { wait.remove(); box.append(framed(`This detail could not be drawn: ${e.message}`)); } }
}
