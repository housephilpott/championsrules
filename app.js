/* ============================================================
   Champions Rules — glossary renderer
   Renders entries from glossary.json (Rules Reference v1.8)
   Handles: paragraphs, ordered/unordered lists, nested children,
            redirect entries, slug-based "see also" links,
            hash routing, and live search.
   ============================================================ */

(() => {
  "use strict";

  /* ---------- State ---------- */
  let ENTRIES = [];          // raw array from glossary.json
  const BY_SLUG = new Map(); // slug -> entry (fast lookup)

  /* ---------- Tiny DOM helpers ---------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Create an element with optional class, text and children.
  function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text != null) node.textContent = opts.text; // textContent = safe (no HTML injection)
    if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
    if (opts.children) opts.children.forEach(c => c && node.appendChild(c));
    return node;
  }

  /* ---------- Boot ---------- */
  async function init() {
    try {
      const res = await fetch("glossary.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ENTRIES = await res.json();
    } catch (err) {
      showError(`Couldn’t load glossary.json (${err.message}).`);
      return;
    }

    // Index by slug, and sort alphabetically by term for the list.
    BY_SLUG.clear();
    ENTRIES.forEach(e => BY_SLUG.set(e.slug, e));
    ENTRIES.sort((a, b) => a.term.localeCompare(b.term));

    buildIndex(ENTRIES);
    wireSearch();
    window.addEventListener("hashchange", routeFromHash);
    routeFromHash(); // render whatever the URL points at (or the first entry)
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
        attrs: { href: `#${entry.slug}`, "data-slug": entry.slug }
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

  // Search inside paragraph/list text so full-text lookups work too.
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

  /* ---------- Routing ---------- */
  function routeFromHash() {
    const slug = decodeURIComponent(location.hash.replace(/^#/, ""));
    const entry = BY_SLUG.get(slug) || ENTRIES[0];
    if (entry) {
      renderEntry(entry);
      highlightActive(entry.slug);
    }
  }

  function highlightActive(slug) {
    $$(".term-link").forEach(a =>
      a.classList.toggle("active", a.dataset.slug === slug)
    );
  }

  /* ---------- Main render ---------- */
  function renderEntry(entry) {
    const main = $("#entry");
    if (!main) return;
    main.innerHTML = "";

    // Title
    main.appendChild(el("h1", { className: "entry-title", text: entry.term }));

    // Source line
    if (entry.source) {
      main.appendChild(el("p", {
        className: "entry-source",
        text: `${entry.source.document} · page ${entry.source.page}`
      }));
    }

    // Redirect entry (e.g. ATK → Basic Power)
    if (entry.redirectTo) {
      main.appendChild(renderRedirect(entry.redirectTo));
      return;
    }

    // Content blocks
    (entry.content || []).forEach(block => {
      const rendered = renderBlock(block);
      if (rendered) main.appendChild(rendered);
    });

    // See also
    if (entry.seeAlso && entry.seeAlso.length) {
      main.appendChild(renderSeeAlso(entry.seeAlso));
    }

    // Scroll content back to top on navigation
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
    return null; // unknown block type — skip gracefully
  }

  // Recursively render a list; children nest one level (schema allows depth 1).
  function renderList(items, ordered) {
    const list = el(ordered ? "ol" : "ul", {
      className: ordered ? "entry-list ordered" : "entry-list"
    });
    (items || []).forEach(item => {
      const li = el("li", { text: item.text });
      if (item.children && item.children.length) {
        // Nested lists inherit the parent's ordered flag by default;
        // sub-steps of an ordered list read best as a nested ordered list.
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

  // Build a slug-based link. If the target isn't loaded yet, render it
  // as a non-clickable "pending" chip so links never dead-end silently.
  function makeTermLink(ref) {
    const exists = BY_SLUG.has(ref.slug);
    if (!exists) {
      return el("span", {
        className: "term-chip pending",
        text: ref.term,
        attrs: { title: "Not yet in the glossary" }
      });
    }
    return el("a", {
      className: "term-chip",
      text: ref.term,
      attrs: { href: `#${ref.slug}` }
    });
  }

  /* ---------- Errors ---------- */
  function showError(msg) {
    const main = $("#entry");
    if (main) main.innerHTML = `<p class="error">${msg}</p>`;
  }

  /* ---------- Go ---------- */
  document.addEventListener("DOMContentLoaded", init);
})();
