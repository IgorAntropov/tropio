const handbookBundle = globalThis.handbookBundle;

if (handbookBundle) {
  startReader(handbookBundle);
}

function startReader({ documents, includeLocal }) {
  const startDocument = 'route-editor/split-track.html';
  const index = new URL('index.html', location.href);
  const sourceIndex = new URL('index.html', document.currentScript.src);
  const localAssets = new URL('../.agents/', sourceIndex).href;
  const documentKeys = new Map(Object.keys(documents).map(path => [new URL(path, sourceIndex).href, path]));
  const reader = document.querySelector('#reader');
  const article = document.querySelector('#document');
  const sourceLink = document.querySelector('#reader-source');
  const sectionLabel = document.querySelector('#reader-section');
  const toggle = document.querySelector('.sidebar-toggle');
  if (includeLocal) {
    const favicon = document.querySelector('[data-local-href]');
    favicon.href = new URL(favicon.dataset.localHref, sourceIndex);
    const logo = document.querySelector('[data-local-src]');
    logo.src = new URL(logo.dataset.localSrc, sourceIndex);
    logo.hidden = false;
    document.documentElement.style.setProperty('--handbook-font', 'Inter, system-ui, sans-serif');
  }
  const entries = [...document.querySelectorAll('#contents a')].flatMap((link) => {
    const target = documentTarget(new URL(link.getAttribute('href'), sourceIndex));
    if (!target) {
      link.closest('li').remove();
      return [];
    }
    link.href = readerLink(target);
    return [{ ...target, link, group: link.closest('details') }];
  });
  for (const group of document.querySelectorAll('#contents details')) {
    if (!group.querySelector('a[href]')) {
      group.remove();
    }
  }
  const diagramObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        diagramObserver.unobserve(entry.target);
        renderDiagram(entry.target);
      }
    }
  }, { rootMargin: '300px' });
  let mermaid;
  let diagramNumber = 0;
  let currentPath;

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  });

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const link = event.target.closest('a[href]');
    if (link?.classList.contains('skip-link')) {
      event.preventDefault();
      toggle.setAttribute('aria-expanded', 'false');
      reader.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      return;
    }
    if (!link || !link.hash.startsWith('#doc=') || link.pathname !== index.pathname) {
      return;
    }
    event.preventDefault();
    toggle.setAttribute('aria-expanded', 'false');
    if (location.hash === link.hash) {
      showSelection(true);
    }
    else {
      history.pushState(null, '', link.hash);
      showSelection(true);
    }
  });

  window.addEventListener('hashchange', () => showSelection(false));
  showSelection(false);

  function documentTarget(url) {
    const section = url.hash ? decodeURI(url.hash.slice(1)) : '';
    const key = new URL(url);
    key.hash = '';
    const path = documentKeys.get(key.href);
    return path ? { path, section } : null;
  }

  function readerLink({ path, section }) {
    const params = new URLSearchParams({ doc: path });
    if (section) {
      params.set('section', section);
    }
    return `#${params}`;
  }

  function showSelection(moveFocus) {
    const params = new URLSearchParams(location.hash.slice(1));
    const path = params.get('doc') ?? startDocument;
    const section = params.get('section') ?? '';
    const changed = currentPath !== path;

    if (changed) {
      currentPath = path;
      showDocument(path);
    }

    const heading = section ? document.getElementById(section) : null;
    const selected = entries.find(entry => entry.path === path && entry.section === section)
      ?? closestSection(path, heading)
      ?? entries.find(entry => entry.path === path && !entry.section);

    for (const { link } of entries) {
      link.removeAttribute('aria-current');
    }
    if (selected) {
      selected.link.setAttribute('aria-current', 'page');
      selected.group.open = true;
    }
    sectionLabel.textContent = selected?.group.querySelector('summary').textContent ?? 'Справочник';

    if (heading && article.contains(heading)) {
      heading.scrollIntoView();
      if (moveFocus) {
        if (!heading.hasAttribute('tabindex')) {
          heading.tabIndex = -1;
        }
        heading.focus({ preventScroll: true });
      }
    }
    else if (changed || moveFocus) {
      window.scrollTo(0, 0);
      if (moveFocus) {
        reader.focus({ preventScroll: true });
      }
    }
  }

  function closestSection(path, heading) {
    if (!heading || !article.contains(heading)) {
      return null;
    }
    const sections = new Map(entries.filter(entry => entry.path === path).map(entry => [entry.section, entry]));
    let closest = null;
    for (const anchor of article.querySelectorAll('[id]')) {
      if (anchor === heading) {
        break;
      }
      closest = sections.get(anchor.id) ?? closest;
    }
    return closest;
  }

  function showDocument(path) {
    diagramObserver.disconnect();
    const template = document.createElement('template');
    const hasDocument = Object.hasOwn(documents, path);
    template.innerHTML = hasDocument ? documents[path] : '<h1>Раздел не найден</h1><p>Выбери доступный документ в оглавлении.</p>';
    const base = hasDocument ? new URL(path, sourceIndex) : sourceIndex;
    prepareContent(template.content, base);

    const title = template.content.querySelector('h1');
    if (title && !title.id) {
      title.id = 'document-title';
    }
    if (title) {
      article.setAttribute('aria-labelledby', title.id);
    }
    document.title = title ? `${title.textContent} · Tropio` : 'Технический справочник Tropio';

    sourceLink.hidden = !hasDocument;
    if (hasDocument) {
      sourceLink.href = base;
    }
    article.replaceChildren(template.content);
    for (const code of article.querySelectorAll('pre > .language-mermaid')) {
      diagramObserver.observe(code.parentElement);
    }
  }

  function prepareContent(content, base) {
    const allowedLinks = new Set(['file:', 'http:', 'https:', 'mailto:']);
    for (const link of content.querySelectorAll('a[href]')) {
      try {
        const url = new URL(link.getAttribute('href'), base);
        if (!allowedLinks.has(url.protocol)) {
          link.removeAttribute('href');
          continue;
        }
        if (!includeLocal && url.href.startsWith(localAssets)) {
          link.replaceWith(...link.childNodes);
          continue;
        }
        if (url.origin === sourceIndex.origin && url.pathname === sourceIndex.pathname) {
          url.pathname = index.pathname;
        }
        const target = documentTarget(url);
        link.href = target ? readerLink(target) : url;
      }
      catch {
        link.removeAttribute('href');
      }
    }
    for (const image of content.querySelectorAll('img[src]')) {
      try {
        const url = new URL(image.getAttribute('src'), base);
        if (!includeLocal && url.href.startsWith(localAssets)) {
          image.replaceWith(image.alt);
          continue;
        }
        if (allowedLinks.has(url.protocol) && url.protocol !== 'mailto:') {
          image.src = url;
        }
        else {
          image.removeAttribute('src');
        }
      }
      catch {
        image.removeAttribute('src');
      }
      image.loading = 'lazy';
    }
    for (const table of content.querySelectorAll('table')) {
      if (table.parentElement?.classList.contains('table-scroll')) {
        continue;
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'table-scroll';
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('tabindex', '0');
      wrapper.setAttribute('aria-label', 'Таблица документа');
      table.replaceWith(wrapper);
      wrapper.append(table);
    }
  }

  async function renderDiagram(source) {
    try {
      const renderer = await (mermaid ??= loadMermaid());
      if (!source.isConnected) {
        return;
      }
      const { svg } = await renderer.render(`diagram-${++diagramNumber}`, source.textContent);
      if (!source.isConnected) {
        return;
      }
      const frame = document.createElement('div');
      frame.className = 'diagram';
      frame.setAttribute('role', 'region');
      frame.setAttribute('tabindex', '0');
      frame.setAttribute('aria-label', 'Схема');
      frame.innerHTML = svg;
      const drawing = frame.querySelector('svg');
      const width = drawing.viewBox.baseVal.width;
      if (width) {
        drawing.style.minInlineSize = `${Math.min(width, 1600)}px`;
      }
      source.replaceWith(frame);
    }
    catch {
      source.classList.add('diagram-source');
    }
  }

  function loadMermaid() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('generated/mermaid.min.js', index);
      script.addEventListener('load', () => {
        const renderer = globalThis.mermaid;
        if (!renderer) {
          reject(new Error('Mermaid недоступен'));
          return;
        }
        renderer.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
        resolve(renderer);
      }, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.append(script);
    });
  }
}
