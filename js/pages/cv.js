/* The CV (#/cv), 21 Nov 2026: the owner's one-page CV as a web page, word for word (GET /api/cv, written by site_cv.py
   from the CV's own source). Public by his choice: everything on the one-page CV except the phone number, the personal
   email and any home address; the LinkedIn link stays. Bold lead-ins and links are the CV's own (**bold**,
   [text](https://url)); the Claude Portfolio's link opens it here. Nodes are built with h() only. Styles: css/site.css. */
(function () {
  const newTab = () => h("span", { class: "sr-only" }, " (opens in a new tab)");
  const arrowOut = () => h("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", "stroke-width": 2,
    "stroke-linecap": "round", "aria-hidden": "true" }, h("path", { d: "M7 17L17 7M9 7h8v8" }));
  /* **bold** and [text](https://url), as build_cv.py reads them; anything else stays plain text */
  function rich(text) {
    const out = [];
    const bits = String(text || "").split(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/);
    for (let k = 0; k < bits.length; k += 3) {
      bits[k].split("**").forEach((s, i) => { if (s) out.push(i % 2 ? h("b", {}, s) : s); });
      if (k + 2 < bits.length) out.push(h("a", { href: bits[k + 2], target: "_blank", rel: "noopener" }, bits[k + 1], newTab()));
    }
    return out;
  }
  const asOf = (s) => { if (!s) return ""; const [y, m, d] = s.split("-"); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
  function entry(e) {
    const link = e.link ? (e.link.href.startsWith("#/") ? h("a", { href: e.link.href }, e.link.text)
      : h("a", { href: e.link.href, target: "_blank", rel: "noopener" }, e.link.text, newTab())) : null;
    const lines = (e.lines || []).map((ln) => (ln.when
      ? h("div", { class: "cvp-row" }, h("p", { class: "cvp-role" }, rich(ln.text)), h("span", { class: "cvp-when" }, ln.when))
      : h("p", { class: "cvp-desc" }, rich(ln.text))));
    return h("div", { class: "cvp-entry" },
      h("div", { class: "cvp-row" }, h("h3", { class: "cvp-org" }, e.org, link ? " " : null, link), e.where ? h("span", { class: "cvp-where" }, e.where) : null),
      lines,
      (e.bullets || []).length ? h("ul", { class: "cvp-bul" }, e.bullets.map((b) => h("li", {}, rich(b)))) : null);
  }
  function page(D) {
    const links = (D.links || []).map((l) => h("a", { class: "nw-btn ghost", href: l.url, target: "_blank", rel: "noopener me" },
      l.label, " ", arrowOut(), newTab()));
    return h("article", { class: "cvp", "aria-labelledby": "cvp-h1" },
      h("header", { class: "cvp-head" },
        h("div", {}, h("p", { class: "nw-eyebrow" }, `Curriculum vitae${D.as_of ? ` · ${asOf(D.as_of)}` : ""}`),
          h("h1", { id: "cvp-h1", tabindex: "-1" }, D.name)),
        links.length ? h("div", { class: "cvp-links" }, links) : null),
      (D.sections || []).map((s, i) => h("section", { class: "cvp-sec", "aria-labelledby": `cvp-s${i}` },
        h("h2", { id: `cvp-s${i}` }, s.title),
        (s.entries || []).map(entry),
        (s.lines || []).length ? h("ul", { class: "cvp-lines" }, s.lines.map((l) => h("li", {}, rich(l)))) : null)),
      h("p", { class: "cvp-foot" }, `The text of the one-page CV${D.as_of ? ` of ${asOf(D.as_of)}` : ""}.`));
  }

  Pages.cv = {
    title: "CV",
    async render(el) {
      el.replaceChildren(h("div", { class: "cvp" }, h("p", { class: "nw-note" }, "Loading…")));
      let D = null;
      try { D = await api("/api/cv"); } catch (_) { D = null; }
      if (!el.isConnected || Router.current !== "cv") return;
      if (!D || !(D.sections || []).length) {
        el.replaceChildren(h("div", { class: "cvp" }, h("h1", { id: "cvp-h1" }, "CV"), h("p", { class: "nw-note" }, "Not available right now.")));
        return;
      }
      document.title = `${D.name} · CV`;
      el.replaceChildren(page(D));
    },
  };
})();
