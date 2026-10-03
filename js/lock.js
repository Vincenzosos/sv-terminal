"use strict";
/* SV Terminal · public snapshot, part 2 of 2: the lock screen, the snapshot status, the public header and the public
   disclaimer. publish.py loads this file after the page files and before main.js on the published site only.
   - My Portfolio (with its briefing and alerts) is the owner's real money and personal data. It renders only after the
     6-digit code opens data/locked.bin in this tab (static.js, BussolaCrypto). The derived key, never the code, is kept
     in sessionStorage, which the browser forgets when the tab closes.
   - The Trading Lab and How it works are public: paper money only.
   - There is no live stream: the top bar says SNAPSHOT, the status bar when it was taken. Short on purpose (30 Sep 2026):
     the lock screen is a code field, an Unlock button and one line; every page has one disclaimer line. Dark only. */
(() => {
  const S = window.BussolaStatic;
  if (!S) return;
  const C = window.BussolaCrypto;
  const LOCKED = ["portfolio"];
  const STORE = "bussola-snapshot-key";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------------------------------------------------------- snapshot time and status */
  const ROME = { timeZone: "Europe/Rome", hourCycle: "h23" };
  S.when = (short = false) => {
    const iso = S.index && S.index.built;
    if (!iso) return "time unknown";
    const d = new Date(iso);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { ...ROME, day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
    return short ? `${+p.day} ${MONTHS[+p.month - 1]} ${p.hour}:${p.minute}` : `${+p.day} ${MONTHS[+p.month - 1]} ${p.year} ${p.hour}:${p.minute} Rome`;
  };
  Live.connect = () => {};                          // no stream in a snapshot
  Live.status = { mode: "snapshot" };
  renderLive = function () {                        // core.js's renderLive, in snapshot words
    const el = $("live");
    if (!el) return;
    const t = S.when();
    el.classList.remove("on", "slow", "off");
    el.classList.add("snap");
    el.querySelector("span").textContent = "SNAPSHOT";
    el.title = `Public snapshot, updated ${t}. Prices are as of then; nothing here is live.`;
    const sb = $("sb-conn");
    if (sb) {                                       /* the long form on a desktop, the short one on a phone (static.css) */
      sb.className = "conn snap";
      sb.replaceChildren(h("span", { class: "lg" }, `◆ updated ${S.when(true)}`), h("span", { class: "sm" }, `◆ ${S.when(true)}`));
      sb.title = el.title;
    }
  };
  S.ready.then(() => renderLive());

  /* ---------------------------------------------------------------- the private bundle */
  let bundle = null;
  S.bundle = () => (bundle = bundle || fetch("data/locked.bin", { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw Object.assign(new Error(r.status === 404 ? "This snapshot has no My Portfolio section." : `data/locked.bin: HTTP ${r.status}`), { missing: true });
    return r.arrayBuffer();
  }).catch((e) => { bundle = null; throw e; }));
  const remember = async (key, header) => {
    try { sessionStorage.setItem(STORE, JSON.stringify({ k: await C.exportKey(key), salt: C.b64(header.salt) })); } catch (_) { /* private window: ask again next load */ }
  };
  const forget = () => { try { sessionStorage.removeItem(STORE); } catch (_) { /* nothing stored */ } };
  S.unlock = async (code) => {
    const { data, key, header } = await C.open(await S.bundle(), code);
    S.setPrivate(data);
    await remember(key, header);
    afterUnlock();
  };
  /* a key kept by this tab opens the bundle without the code (same snapshot salt) */
  let tried = false;
  S.tryStored = async () => {
    if (S.unlocked) return true;
    if (tried) return false;
    tried = true;
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch (_) { st = null; }
    if (!st || !st.k) return false;
    try {
      const h = C.parseHeader(await S.bundle());
      if (C.b64(h.salt) !== st.salt) { forget(); return false; }
      S.setPrivate(await C.openWithKey(await C.importKey(st.k), h));
      afterUnlock(false);
      return true;
    } catch (_) { forget(); return false; }
  };
  /* locking again forgets the key and reloads the tab: the pages keep answers in their own memory (fund lists, the
     inbox badge, charts), and a reload is the one way to drop all of it */
  S.lock = () => {
    forget();
    S.priv = null; S.unlocked = false; tried = true;
    location.reload();
  };
  function afterUnlock(rerender = true) {
    lockBtn.hidden = false;
    Object.keys(memo).forEach((k) => delete memo[k]);       // drop the "locked" answers cached before
    if (typeof pollInbox === "function") pollInbox();
    if (typeof loadFunds === "function") loadFunds();
    if (rerender) Router.render();
  }
  /* a "lock again" key in the top bar, shown while unlocked */
  const lockIcon = (size, sw = "1.8", cls = null) => h("svg", { class: cls, viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": sw, "stroke-linecap": "round", "aria-hidden": "true" },
    h("rect", { x: 5, y: 11, width: 14, height: 10, rx: 1 }), h("path", { d: "M8 11V8a4 4 0 0 1 8 0v3" }));
  const lockBtn = h("button", { class: "icon-btn pub-lock", type: "button", id: "pub-lock", hidden: true, title: "Lock My Portfolio again",
    "aria-label": "Lock My Portfolio again", onclick: () => S.lock() }, lockIcon(16));
  const right = document.querySelector(".top-right");
  if (right) right.append(lockBtn);

  /* ---------------------------------------------------------------- the public header
     body.pub (static.css, app.css): no search box or alerts bell. The My Portfolio tab carries a lock (it opens with the
     owner's code); the top bar has no clock (the status bar says when the snapshot was taken); the status bar also
     shows the lab's own clock (the L&S session end). */
  document.body.classList.add("pub");
  const pfTab = document.querySelector('#tabs a[data-nav="portfolio"]');
  if (pfTab) {
    pfTab.querySelector("b").append(lockIcon(11, "2.4", "pub-lk"));
    const sm = pfTab.querySelector("small");
    if (sm) sm.textContent = "private · owner's code";
    pfTab.setAttribute("aria-label", "My Portfolio: private, opens with the owner's code");
  }
  const clockEl = $("clock");
  if (clockEl) clockEl.hidden = true;
  const sbar = $("statusbar");
  if (sbar) {
    sbar.querySelectorAll(".mk").forEach((x) => x.remove());
    const next = h("span", { class: "nx" });
    const sess = h("span", { class: "pub-sess", title: "The lab settles after the Lang & Schwarz session end, about 23:00 Berlin, on L&S trading days" },
      h("b", {}, "L&S"), h("span", {}, "≈23:00"), next);
    const tag = $("sb-ws");
    if (tag) tag.after(sess); else sbar.prepend(sess);
    S.ready.then(() => fetch("/api/lab/summary")).then((r) => r.json()).then((s) => {
      const ev = (((s || {}).next_events || {}).events || []).find((e) => Date.parse(e.at) > Date.now());
      if (ev && typeof LabUI !== "undefined") next.textContent = `· next lab step ${LabUI.relIn(ev.at)}`;
    }).catch(() => {});
  }

  /* ---------------------------------------------------------------- the lock screen: a code field, Unlock, one line */
  const LOCK_LINE = "Private · owner's code";
  function lockScreen(el, id) {
    const cells = h("div", { class: "pub-cells", "aria-hidden": "true" }, [0, 1, 2, 3, 4, 5].map(() => h("span", {})));
    const input = h("input", { id: "pub-code", class: "pub-code", type: "password", inputmode: "numeric", pattern: "[0-9]*", maxlength: "6",
      autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Six-digit code", "aria-describedby": "pub-msg" });
    const btn = h("button", { class: "btn primary", type: "submit", id: "pub-go" }, "Unlock");
    S.bundle().catch(() => {});                     // fetched now: the unlock is quicker (a missing file shows on the first try)
    const msg = h("p", { class: "pub-msg", id: "pub-msg", role: "status", "aria-live": "polite", title: "Six digits. Nothing is sent anywhere: the code opens the file here, in this tab." }, LOCK_LINE);
    const paint = () => {
      const v = input.value;
      [...cells.children].forEach((c, i) => { c.textContent = i < v.length ? "●" : ""; c.className = i < v.length ? "on" : i === v.length ? "cur" : ""; });
    };
    input.addEventListener("input", () => {
      const clean = input.value.replace(/\D/g, "").slice(0, 6);
      if (clean !== input.value) input.value = clean;
      paint();
      if (msg.className !== "pub-msg") { msg.className = "pub-msg"; msg.textContent = LOCK_LINE; }
    });
    const form = h("form", { class: "pub-form", autocomplete: "off", onsubmit: async (e) => {
      e.preventDefault();
      const code = input.value;
      if (!/^\d{6}$/.test(code)) { msg.className = "pub-msg bad"; msg.textContent = "Six digits"; input.focus(); return; }
      input.disabled = true; btn.disabled = true;
      msg.className = "pub-msg busy"; msg.textContent = "Checking…";
      try {
        await S.unlock(code);
      } catch (err) {
        await sleep(1200);                          // a short pause after every failed try
        input.disabled = false; btn.disabled = false;
        input.value = ""; paint();
        msg.className = "pub-msg bad";
        msg.textContent = err && err.missing ? err.message : "Wrong code";
        input.focus();
      }
    } },
    h("label", { class: "pub-field", for: "pub-code" }, h("span", { class: "prompt" }, "CODE ›"), h("span", { class: "pub-box" }, input, cells)), btn);
    el.append(pageHead(["My Portfolio", "private"]), section("lock", null, h("div", { class: "pub-lock-box" }, form, msg), { cls: "pub-lock-sec" }));
    paint();
    setTimeout(() => { if (input.isConnected && !matchMedia("(pointer: coarse)").matches) input.focus(); }, 60);
    statusSource("Encrypted section");
  }
  for (const id of LOCKED) {
    const p = Pages[id];
    if (!p) continue;
    const real = p.render;
    p.render = async function (el, params) {
      await S.ready;
      if (S.unlocked || (await S.tryStored())) {
        if (!el.isConnected) return;
        return real.call(this, el, params);
      }
      if (Router.current !== id) return;             // the reader moved on while the key was checked
      el.replaceChildren();
      lockScreen(el, id);
    };
  }
  /* ---------------------------------------------------------------- the disclaimer follows the workspace
     Trading Lab and How it works keep the one-line public disclaimer exactly as index.html has it; My Portfolio is the
     owner's real money, so "paper money" would be wrong there: it says what it is, and that it is not advice. Both link
     "More" to How it works > Legal, where the full text lives. */
  const disc = $("pub-disclaimer");
  const PUBLIC_DISC = disc ? disc.innerHTML : "";
  const PRIVATE_DISC = '<p>Your own portfolio · facts, not advice · <a href="#/about?open=legal">More</a></p>';
  const setDisclaimer = (page) => {
    if (!disc) return;
    const priv = page === "portfolio";
    if (disc.dataset.kind === (priv ? "private" : "public")) return;
    disc.dataset.kind = priv ? "private" : "public";
    disc.innerHTML = priv ? PRIVATE_DISC : PUBLIC_DISC;
  };
  const route = Router.render.bind(Router);
  Router.render = function () { setDisclaimer(Router.parse().page); return route(); };

  /* the logo goes to the public front page */
  const logo = document.querySelector("a.logo");
  if (logo) { logo.setAttribute("href", "#/lab"); logo.setAttribute("aria-label", "SV Terminal, Trading Lab"); }
})();
