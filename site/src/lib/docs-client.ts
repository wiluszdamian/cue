/** On-this-page index with scrollspy, code tabs, sidebar search and the helpful prompt. */
export function initDocs(): void {
  buildToc();
  initTabs();
  initSearch();
  document.querySelectorAll('[data-helpful]').forEach((b) => {
    b.addEventListener('click', () => {
      const thanks = document.getElementById('helpful-thanks');
      if (thanks) thanks.hidden = false;
    });
  });
}

function buildToc(): void {
  const toc = document.getElementById('toc');
  if (!toc) return;
  const heads = [...document.querySelectorAll<HTMLHeadingElement>('.docs-main h2[id]')];
  const links = heads.map((h) => {
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent;
    toc.appendChild(a);
    return a;
  });
  if (heads.length === 0) return;
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const i = heads.indexOf(entry.target as HTMLHeadingElement);
        links.forEach((a, j) => a.classList.toggle('active', i === j));
      }
    },
    { rootMargin: '-70px 0px -70% 0px' },
  );
  heads.forEach((h) => spy.observe(h));
}

function initTabs(): void {
  document.querySelectorAll<HTMLElement>('[data-tabs]').forEach((group) => {
    const tabs = [...group.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panes = [...group.querySelectorAll<HTMLPreElement>('pre')];
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t, j) => {
          t.setAttribute('aria-selected', String(i === j));
          const pane = panes[j];
          if (pane) pane.hidden = i !== j;
        });
      });
    });
  });
}

function initSearch(): void {
  const search = document.getElementById('docs-search') as HTMLInputElement | null;
  const noHits = document.getElementById('no-hits');
  if (!search || !noHits) return;
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.docs-nav a[data-search]')];
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let hits = 0;
    for (const a of links) {
      const match = q === '' || (a.dataset.search ?? '').includes(q);
      a.hidden = !match;
      if (match) hits++;
    }
    document.querySelectorAll<HTMLElement>('.docs-nav .group').forEach((g) => {
      g.hidden = g.querySelector('a:not([hidden])') === null;
    });
    noHits.hidden = hits > 0;
  });
  search.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const first = links.find((a) => !a.hidden);
    if (first) window.location.href = first.href;
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && document.activeElement !== search) {
      ev.preventDefault();
      search.focus();
    }
  });
}
