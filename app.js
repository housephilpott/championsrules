/* ============================================================
   Champions Rules — app shell + glossary renderer
   Rules Reference v1.8

   Sections (two-level hash router):
     #home              → landing hub with buttons
     #glossary          → searchable glossary (default first term)
     #glossary/<slug>   → a specific glossary entry
     #overview          → document overview / golden rules
     #notable-changes   → v1.8 changelog
     #appendixes        → list of appendices

   Glossary rendering (paragraphs, ordered/unordered lists, nested
   children, redirect entries, slug-based "see also" links) is
   unchanged — its term links now live under #glossary/<slug>.
   ============================================================ */

(() => {
  "use strict";

  /* ---------- State ---------- */
  let ENTRIES = [];           // raw array from glossary.json
  let glossaryLoaded = false; // lazy-load guard
  const BY_SLUG = new Map();  // slug -> entry (fast lookup)

  let APPENDICES = [];          // raw array from appendices.json
  let appendicesLoaded = false; // lazy-load guard
  const APX_BY_ID = new Map();  // id -> appendix

  const SECTIONS = ["home", "glossary", "overview", "notable-changes", "appendixes"];

  /* ---------- Tiny DOM helpers ---------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text != null) node.textContent = opts.text; // safe (no HTML injection)
    if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
    if (opts.children) opts.children.forEach(c => c && node.appendChild(c));
    return node;
  }

  /* ============================================================
     Boot
     ============================================================ */
  function init() {
    wireSearch();
    window.addEventListener("hashchange", route);
    route(); // render whatever the URL points at (or home)
  }

  /* ============================================================
     Router
     ============================================================ */
  function parseHash() {
    // Strip leading "#" and optional "/", then split into section/param.
    const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [section, ...rest] = raw.split("/");
    return { section: SECTIONS.includes(section) ? section : "home", param: rest.join("/") };
  }

  async function route() {
    const { section, param } = parseHash();

    showView(section);
    updateHeader(section);
    window.scrollTo(0, 0);

    if (section === "glossary") {
      await ensureGlossary();
      renderGlossaryRoute(param);
    }

    if (section === "appendixes") {
      await ensureAppendices();
      renderAppendixRoute(param);
    }
  }

  // Show the requested view, hide the others.
  function showView(section) {
    $$(".view").forEach(v => {
      v.hidden = (v.dataset.section !== section);
    });
  }

  // Toggle the "‹ Home" back link (hidden on the home screen itself).
  function updateHeader(section) {
    const back = $("#backHome");
    if (back) back.hidden = (section === "home");
  }

  /* ============================================================
     Glossary — lazy load + render
     ============================================================ */
  async function ensureGlossary() {
    if (glossaryLoaded) return;
    try {
      const res = await fetch("glossary.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ENTRIES = await res.json();
    } catch (err) {
      showError(`Couldn’t load glossary.json (${err.message}).`);
      return;
    }
    BY_SLUG.clear();
    ENTRIES.forEach(e => BY_SLUG.set(e.slug, e));
    ENTRIES.sort((a, b) => a.term.localeCompare(b.term));
    buildIndex(ENTRIES);
    glossaryLoaded = true;
  }

  function renderGlossaryRoute(slug) {
    const entry = BY_SLUG.get(slug) || ENTRIES[0];
    if (entry) {
      renderEntry(entry);
      highlightActive(entry.slug);
    }
  }

  /* ============================================================
     Appendices — lazy load + render
     ============================================================ */
  async function ensureAppendices() {
    if (appendicesLoaded) return;
    try {
      const res = await fetch("appendices.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      APPENDICES = await res.json();
    } catch (err) {
      const box = $("#appendixEntry");
      if (box) box.innerHTML = `<p class="error">Couldn’t load appendices.json (${err.message}).</p>`;
      return;
    }
    APX_BY_ID.clear();
    APPENDICES.forEach(a => APX_BY_ID.set(a.id, a));
    appendicesLoaded = true;
  }

  // param empty → show the card index; param set → show that appendix.
  function renderAppendixRoute(id) {
    const index = $("#appendixIndex");
    const entry = $("#appendixEntry");
    if (!index || !entry) return;

    const apx = id && APX_BY_ID.get(id);
    if (apx) {
      index.hidden = true;
      entry.hidden = false;
      renderAppendix(apx);
    } else {
      entry.hidden = true;
      index.hidden = false;
    }
  }

  function renderAppendix(apx) {
    const main = $("#appendixEntry");
    main.innerHTML = "";

    main.appendChild(el("a", {
      className: "back-home appendix-back",
      text: "‹ All appendixes",
      attrs: { href: "#appendixes" }
    }));

    main.appendChild(el("h1", {
      className: "entry-title",
      text: `Appendix ${apx.num}: ${apx.title}`
    }));
    if (apx.page) {
      main.appendChild(el("p", {
        className: "entry-source",
        text: `Rules Reference v1.8 · page ${apx.page}`
      }));
    }

    (apx.blocks || []).forEach(b => {
      const node = renderApxBlock(b);
      if (node) main.appendChild(node);
    });
    main.scrollTop = 0;
  }

  // Appendix blocks add "heading" and "question" on top of paragraph/list.
  function renderApxBlock(b) {
    if (b.type === "heading") {
      const tag = b.level === 2 ? "h3" : "h2";
      return el(tag, { className: `apx-h${b.level || 1}`, text: b.text });
    }
    if (b.type === "question") {
      return el("p", { className: "apx-question", text: b.text });
    }
    // paragraph / list reuse the glossary block renderer
    return renderBlock(b);
  }

  /* ---------- Left-hand index / term list ---------- */
  function buildIndex(list) {
    const nav = $("#termList");
    if (!nav) return;
    nav.innerHTML = "";

    if (list.length === 0) {
      nav.appendChild(el("p", { className: "muted", text: "No matching terms." }));
      return;
    }

    list.forEach(entry => {
      const link = el("a", {
        className: "term-link",
        text: entry.term,
        attrs: { href: `#glossary/${entry.slug}`, "data-slug": entry.slug }
      });
      if (entry.redirectTo) link.appendChild(el("span", { className: "redirect-tag", text: "↪" }));
      nav.appendChild(link);
    });
  }

  /* ---------- Search ---------- */
  function wireSearch() {
    const input = $("#search");
    if (!input) return;
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (!q) return buildIndex(ENTRIES);
      const filtered = ENTRIES.filter(e =>
        e.term.toLowerCase().includes(q) || matchesContent(e, q)
      );
      buildIndex(filtered);
    });
  }

  function matchesContent(entry, q) {
    if (!entry.content) return false;
    const walk = items => items.some(it =>
      (it.text && it.text.toLowerCase().includes(q)) ||
      (it.children && walk(it.children))
    );
    return entry.content.some(block => {
      if (block.type === "paragraph") return block.text.toLowerCase().includes(q);
      if (block.type === "list") return walk(block.items);
      return false;
    });
  }

  function highlightActive(slug) {
    $$(".term-link").forEach(a =>
      a.classList.toggle("active", a.dataset.slug === slug)
    );
  }

  /* ---------- Main entry render ---------- */
  function renderEntry(entry) {
    const main = $("#entry");
    if (!main) return;
    main.innerHTML = "";

    main.appendChild(el("h1", { className: "entry-title", text: entry.term }));

    if (entry.source) {
      main.appendChild(el("p", {
        className: "entry-source",
        text: `${entry.source.document} · page ${entry.source.page}`
      }));
    }

    if (entry.redirectTo) {
      main.appendChild(renderRedirect(entry.redirectTo));
      return;
    }

    (entry.content || []).forEach(block => {
      const rendered = renderBlock(block);
      if (rendered) main.appendChild(rendered);
    });

    if (entry.seeAlso && entry.seeAlso.length) {
      main.appendChild(renderSeeAlso(entry.seeAlso));
    }

    main.scrollTop = 0;
  }

  function renderRedirect(targets) {
    const wrap = el("div", { className: "redirect-block" });
    wrap.appendChild(el("span", { text: "See: " }));
    targets.forEach((t, i) => {
      if (i > 0) wrap.appendChild(el("span", { text: ", " }));
      wrap.appendChild(makeTermLink(t));
    });
    return wrap;
  }

  /* ---------- Block renderers ---------- */
  function renderBlock(block) {
    if (block.type === "paragraph") {
      return el("p", { className: "entry-para", text: block.text });
    }
    if (block.type === "list") {
      return renderList(block.items, block.ordered === true);
    }
    return null;
  }

  function renderList(items, ordered) {
    const list = el(ordered ? "ol" : "ul", {
      className: ordered ? "entry-list ordered" : "entry-list"
    });
    (items || []).forEach(item => {
      const li = el("li", { text: item.text });
      if (item.children && item.children.length) {
        li.appendChild(renderList(item.children, ordered));
      }
      list.appendChild(li);
    });
    return list;
  }

  /* ---------- See also ---------- */
  function renderSeeAlso(refs) {
    const section = el("section", { className: "see-also" });
    section.appendChild(el("h2", { text: "See also" }));
    const wrap = el("div", { className: "see-also-links" });
    refs.forEach(ref => wrap.appendChild(makeTermLink(ref)));
    section.appendChild(wrap);
    return section;
  }

  // Slug-based link (now under #glossary/). Unresolved targets render
  // as a non-clickable "pending" chip so links never dead-end silently.
  function makeTermLink(ref) {
    if (!BY_SLUG.has(ref.slug)) {
      return el("span", {
        className: "term-chip pending",
        text: ref.term,
        attrs: { title: "Not yet in the glossary" }
      });
    }
    return el("a", {
      className: "term-chip",
      text: ref.term,
      attrs: { href: `#glossary/${ref.slug}` }
    });
  }

  /* ---------- Errors ---------- */
  function showError(msg) {
    const main = $("#entry");
    if (main) main.innerHTML = `<p class="error">${msg}</p>`;
  }

  /* ---------- Service worker (offline support) ---------- */
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js")
        .catch(err => console.warn("Service worker registration failed:", err));
    });
  }

  /* ---------- Go ---------- */
  document.addEventListener("DOMContentLoaded", init);
  registerServiceWorker();
})();
