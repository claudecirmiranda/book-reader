(() => {
  'use strict';

  const API = window.BOOK_CONFIG.api;
  const $ = id => document.getElementById(id);

  // ── Armazenamento local (tolerante a falhas) ───────────
  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const prefs = Object.assign({ theme: 'claro', size: 100, font: 'serif' }, store.get('chd:prefs', {}));
  const savePrefs = () => store.set('chd:prefs', prefs);

  const THEMES = {
    claro:  { bg: '#ffffff', fg: '#1e1008', box: '#f5efe6', mute: '#444444', head: '#4a2c0a' },
    sepia:  { bg: '#f1e4c8', fg: '#3b2a14', box: '#e6d6b0', mute: '#4a3a22', head: '#4a2c0a' },
    escuro: { bg: '#17110c', fg: '#e8dccb', box: '#2a2018', mute: '#c9bba7', head: '#e8c98a' }
  };
  const FONTS = {
    serif: "Georgia, 'Gentium Plus', serif",
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  };

  let cur = null; // { id, title, book, rendition, toc, spineTotal, lastCfi, lastHref }

  // ── Biblioteca ─────────────────────────────────────────
  const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
  const fileUrl = id => API + '?file=' + encodeURIComponent(id);

  async function loadLibrary() {
    const status = $('lib-status');
    let livros = store.get('chd:list', []);
    status.textContent = livros.length ? '' : 'Carregando…';
    try {
      const r = await fetch(API, { cache: 'no-cache' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || 'Falha');
      livros = j.livros;
      store.set('chd:list', livros);
      status.textContent = '';
    } catch (e) {
      status.textContent = livros.length ? 'Sem conexão. Mostrando os livros salvos.' : 'Não foi possível carregar a biblioteca.';
    }
    renderLibrary(livros, await cachedIds());
  }

  async function cachedIds() {
    try {
      const c = await caches.open('chd-books');
      return new Set((await c.keys()).map(r => new URL(r.url).searchParams.get('file')));
    } catch (e) { return new Set(); }
  }

  function renderLibrary(livros, cached) {
    const box = $('books');
    box.innerHTML = '';
    if (!livros.length) { box.innerHTML = '<p class="empty">Nenhum livro disponível.</p>'; return; }
    for (const l of livros) {
      const pos = store.get('chd:pos:' + l.id, null);
      const b = document.createElement('button');
      b.className = 'book';
      b.innerHTML = '<div class="cover">☕</div><div class="info"><div class="t"></div><div class="a"></div><div class="m"></div></div>';
      b.querySelector('.t').textContent = l.title;
      b.querySelector('.a').textContent = l.author || '';
      const m = b.querySelector('.m');
      const add = (txt, pill) => {
        const s = document.createElement('span');
        s.textContent = txt;
        if (pill) s.className = 'pill';
        m.appendChild(s);
      };
      add(fmtSize(l.size));
      if (cached.has(l.id)) add('disponível offline', true);
      if (pos && pos.pct) add('lido ' + pos.pct + '%', true);
      b.onclick = () => { location.hash = '#/livro/' + encodeURIComponent(l.id); };
      box.appendChild(b);
    }
  }

  // ── Obtenção do arquivo (cache primeiro, atualiza em segundo plano) ──
  async function getBuffer(id) {
    const url = fileUrl(id);
    let cache = null;
    try { cache = await caches.open('chd-books'); } catch (e) {}
    const refresh = async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (cache) await cache.put(url, res.clone());
      return res.arrayBuffer();
    };
    if (cache) {
      const hit = await cache.match(url);
      if (hit) { refresh().catch(() => {}); return hit.arrayBuffer(); }
    }
    return refresh();
  }

  // ── Leitor ─────────────────────────────────────────────
  async function openBook(id) {
    closeAll();
    $('library').classList.add('hidden');
    $('reader').classList.remove('hidden');
    $('loading').classList.remove('hidden');
    $('loading').textContent = 'Carregando livro…';
    $('book-title').textContent = '';
    applyChrome();

    let buf;
    try { buf = await getBuffer(id); }
    catch (e) {
      $('loading').textContent = 'Não foi possível baixar o livro. Verifique a conexão.';
      return;
    }

    const book = ePub(buf);
    const rendition = book.renderTo('viewer', {
      width: '100%', height: '100%', flow: 'paginated', spread: 'none', minSpreadWidth: 99999
    });
    cur = { id, title: id, book, rendition, toc: [], spineTotal: 1, lastCfi: null, lastHref: null };

    Object.keys(THEMES).forEach(name => {
      const t = THEMES[name];
      rendition.themes.register(name, {
        'html, body': { 'background': t.bg + ' !important', 'color': t.fg + ' !important' },
        'p, .corpo p, .mes-texto p': { 'color': t.mute + ' !important' },
        '.versiculo, .leitura': { 'background': t.box + ' !important' },
        '.vtexto, .mes-versiculo': { 'color': t.fg + ' !important' },
        '.titulo, .vref, .mes-nome, .mes-ref, .capitular, .capa h1, .capa .autor, .mes-assinatura, .leitura': { 'color': t.head + ' !important' },
        // tarja azul da frase do dia: texto, número e linha sempre brancos
        '.frase-box p.frase, .frase-box p.indice': { 'color': '#ffffff !important' },
        '.frase-box p.indice': { 'border-top': '1px solid rgba(255,255,255,.55) !important' }
      });
    });
    applyReaderPrefs();

    await book.ready;
    const meta = book.packaging && book.packaging.metadata;
    cur.title = (meta && meta.title) || id;
    $('book-title').textContent = cur.title;
    document.title = cur.title;
    cur.spineTotal = book.spine.length || 1;
    try { cur.toc = (await book.loaded.navigation).toc || []; } catch (e) { cur.toc = []; }
    $('btn-today').classList.toggle('hidden', !todayItem());

    rendition.on('relocated', onRelocated);
    rendition.on('selected', onSelected);
    rendition.hooks.content.register(contents => {
      contents.document.addEventListener('keyup', onKey);
      // deslizar para virar página
      let x0 = null;
      contents.document.addEventListener('touchstart', e => { x0 = e.changedTouches[0].clientX; }, { passive: true });
      contents.document.addEventListener('touchend', e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 50) { if (dx < 0) rendition.next(); else rendition.prev(); }
      }, { passive: true });
    });

    const pos = store.get('chd:pos:' + id, null);
    try { await rendition.display(pos && pos.cfi ? pos.cfi : undefined); }
    catch (e) { await rendition.display(); }
    $('loading').classList.add('hidden');

    for (const h of store.get('chd:hl:' + id, [])) addHighlight(h.cfi);
  }

  function onRelocated(loc) {
    if (!cur) return;
    const idx = loc.start.index;
    const d = loc.start.displayed;
    const within = d ? (d.page - 1) / Math.max(d.total, 1) : 0;
    const pct = Math.min(100, Math.round(((idx + within) / cur.spineTotal) * 100));
    $('progress').value = pct;
    $('progress-text').textContent = pct + '%';
    cur.lastCfi = loc.start.cfi;
    cur.lastHref = loc.start.href;
    store.set('chd:pos:' + cur.id, { cfi: cur.lastCfi, pct, idx, at: Date.now() });
    refreshMarkButton();
    if (!$('drawer').classList.contains('hidden')) renderDrawer();
  }

  function onKey(e) {
    if (!cur) return;
    if (e.key === 'ArrowRight') cur.rendition.next();
    if (e.key === 'ArrowLeft') cur.rendition.prev();
  }

  function closeBook() {
    if (cur) { try { cur.rendition.destroy(); cur.book.destroy(); } catch (e) {} cur = null; }
    $('viewer').innerHTML = '';
    document.title = 'Café com Homens de Deus | Livros';
    closeAll();
    clearSel();
    $('reader').classList.add('hidden');
    $('library').classList.remove('hidden');
    loadLibrary();
  }

  // ── Ajustes de leitura ─────────────────────────────────
  function applyChrome() {
    document.body.dataset.theme = prefs.theme;
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = THEMES[prefs.theme].bg;
    $('font-val').textContent = prefs.size + '%';
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('on', b.dataset.theme === prefs.theme));
    document.querySelectorAll('.font-btn').forEach(b => b.classList.toggle('on', b.dataset.font === prefs.font));
  }

  function applyReaderPrefs() {
    applyChrome();
    if (!cur) return;
    const t = cur.rendition.themes;
    t.select(prefs.theme);
    t.fontSize(prefs.size + '%');
    t.font(FONTS[prefs.font]);
  }

  // ── Navegação e sumário ────────────────────────────────
  const pad3 = n => String(n).padStart(3, '0');
  function dayOfYear(d) {
    d = d || new Date();
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  }
  function flatToc(items, out) {
    items = items || (cur ? cur.toc : []);
    out = out || [];
    for (const i of items) { out.push(i); if (i.subitems && i.subitems.length) flatToc(i.subitems, out); }
    return out;
  }
  const hrefFile = h => (h || '').split('#')[0];
  function todayItem() {
    if (!cur) return null;
    const prefix = pad3(Math.min(dayOfYear(), 365));
    return flatToc().find(i => i.label.trim().startsWith(prefix + ' ')) || null;
  }

  function goto(target) {
    cur.rendition.display(target).catch(() => {});
    closeAll();
  }

  // ── Marcadores e destaques ─────────────────────────────
  const marksKey = () => 'chd:marks:' + cur.id;
  const hlKey = () => 'chd:hl:' + cur.id;

  function chapterLabel(href) {
    const f = hrefFile(href);
    const hit = flatToc().find(i => hrefFile(i.href) === f);
    return hit ? hit.label.trim() : 'Trecho';
  }

  function currentMark() {
    if (!cur || !cur.lastHref) return null;
    const f = hrefFile(cur.lastHref);
    return store.get(marksKey(), []).find(m => hrefFile(m.href) === f) || null;
  }

  function refreshMarkButton() {
    const on = !!currentMark();
    const b = $('btn-mark');
    b.textContent = on ? '★' : '☆';
    b.classList.toggle('on', on);
  }

  function toggleMark() {
    if (!cur || !cur.lastCfi) return;
    const list = store.get(marksKey(), []);
    const f = hrefFile(cur.lastHref);
    const i = list.findIndex(m => hrefFile(m.href) === f);
    if (i >= 0) list.splice(i, 1);
    else list.push({ cfi: cur.lastCfi, href: cur.lastHref, label: chapterLabel(cur.lastHref), at: Date.now() });
    store.set(marksKey(), list);
    refreshMarkButton();
    if (!$('drawer').classList.contains('hidden')) renderDrawer();
  }

  let pendingSel = null;
  function onSelected(cfiRange) {
    pendingSel = cfiRange;
    $('sel-bar').classList.remove('hidden');
  }
  function clearSel() {
    pendingSel = null;
    $('sel-bar').classList.add('hidden');
    try { if (cur) cur.rendition.getContents().forEach(c => c.window.getSelection().removeAllRanges()); } catch (e) {}
  }

  function addHighlight(cfi) {
    try {
      cur.rendition.annotations.highlight(cfi, {}, () => {}, 'chd-hl', { fill: '#e0a526', 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' });
    } catch (e) {}
  }

  async function saveHighlight() {
    if (!pendingSel || !cur) return;
    const cfi = pendingSel;
    let text = '';
    try { text = (await cur.book.getRange(cfi)).toString().trim(); } catch (e) {}
    const list = store.get(hlKey(), []);
    list.push({ cfi, text: text.slice(0, 280), label: chapterLabel(cur.lastHref), at: Date.now() });
    store.set(hlKey(), list);
    addHighlight(cfi);
    clearSel();
  }

  // ── Painel lateral ─────────────────────────────────────
  let tab = 'toc';
  function openDrawer(t) {
    if (t) tab = t;
    $('drawer').classList.remove('hidden');
    $('scrim').classList.remove('hidden');
    $('settings').classList.add('hidden');
    renderDrawer(true);
  }
  function closeAll() {
    $('drawer').classList.add('hidden');
    $('settings').classList.add('hidden');
    $('scrim').classList.add('hidden');
  }

  function renderDrawer(scroll) {
    if (!cur) return;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const body = $('drawer-body');
    body.innerHTML = '';
    const empty = txt => {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = txt;
      body.appendChild(p);
    };
    let currentEl = null;

    if (tab === 'toc') {
      const here = hrefFile(cur.lastHref);
      const items = flatToc();
      if (!items.length) return empty('Este livro não tem sumário.');
      for (const i of items) {
        const b = document.createElement('button');
        const isDay = /^\d{3}\s/.test(i.label.trim());
        const isCurrent = hrefFile(i.href) === here;
        b.className = 'item' + (isDay ? '' : ' month') + (isCurrent ? ' current' : '');
        b.textContent = i.label.trim();
        b.onclick = () => goto(i.href);
        body.appendChild(b);
        if (isCurrent) currentEl = b;
      }
    } else {
      const isMarks = tab === 'marks';
      const key = isMarks ? marksKey() : hlKey();
      const list = store.get(key, []).slice().sort((a, b) => b.at - a.at);
      if (!list.length) {
        return empty(isMarks ? 'Toque na estrela no topo para marcar uma página.' : 'Selecione um trecho do texto e toque em Destacar.');
      }
      for (const m of list) {
        const b = document.createElement('div');
        b.className = 'item';
        b.setAttribute('role', 'button');
        b.tabIndex = 0;
        const del = document.createElement('button');
        del.className = 'del';
        del.textContent = '✕';
        del.setAttribute('aria-label', 'Remover');
        del.onclick = e => {
          e.stopPropagation();
          store.set(key, store.get(key, []).filter(x => x.cfi !== m.cfi));
          if (!isMarks) { try { cur.rendition.annotations.remove(m.cfi, 'highlight'); } catch (err) {} }
          refreshMarkButton();
          renderDrawer();
        };
        const t = document.createElement('div');
        t.textContent = isMarks ? m.label : (m.text || m.label);
        const s = document.createElement('small');
        s.textContent = (isMarks ? '' : m.label + ' · ') + new Date(m.at).toLocaleDateString('pt-BR');
        b.append(del, t, s);
        b.onclick = () => goto(m.cfi);
        body.appendChild(b);
      }
    }
    if (scroll && currentEl) currentEl.scrollIntoView({ block: 'center' });
  }

  // ── Eventos ────────────────────────────────────────────
  $('btn-back').onclick = () => { location.hash = '#/'; };
  $('btn-menu').onclick = () => openDrawer('toc');
  $('drawer-close').onclick = closeAll;
  $('scrim').onclick = closeAll;
  $('btn-mark').onclick = toggleMark;
  $('btn-settings').onclick = () => {
    const open = $('settings').classList.contains('hidden');
    closeAll();
    if (open) { $('settings').classList.remove('hidden'); $('scrim').classList.remove('hidden'); }
  };
  document.querySelectorAll('.tab').forEach(b => { b.onclick = () => { tab = b.dataset.tab; renderDrawer(); }; });
  $('prev').onclick = () => { if (cur) cur.rendition.prev(); };
  $('next').onclick = () => { if (cur) cur.rendition.next(); };
  $('btn-highlight').onclick = saveHighlight;
  $('btn-sel-cancel').onclick = clearSel;
  $('btn-today').onclick = () => { const i = todayItem(); if (i) goto(i.href); };

  $('font-minus').onclick = () => { prefs.size = Math.max(70, prefs.size - 10); savePrefs(); applyReaderPrefs(); };
  $('font-plus').onclick = () => { prefs.size = Math.min(200, prefs.size + 10); savePrefs(); applyReaderPrefs(); };
  document.querySelectorAll('.theme-btn').forEach(b => { b.onclick = () => { prefs.theme = b.dataset.theme; savePrefs(); applyReaderPrefs(); }; });
  document.querySelectorAll('.font-btn').forEach(b => { b.onclick = () => { prefs.font = b.dataset.font; savePrefs(); applyReaderPrefs(); }; });

  // barra de progresso: salta para o capítulo na posição relativa
  $('progress').onchange = e => {
    if (!cur) return;
    const idx = Math.min(cur.spineTotal - 1, Math.round((e.target.value / 100) * cur.spineTotal));
    const item = cur.book.spine.get(idx);
    if (item) cur.rendition.display(item.href).catch(() => {});
  };

  document.addEventListener('keyup', e => {
    if (e.key === 'Escape') { closeAll(); return; }
    onKey(e);
  });

  // ── Rotas por hash ─────────────────────────────────────
  function route() {
    const m = location.hash.match(/^#\/livro\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!cur || cur.id !== id) openBook(id);
    } else if (cur || !$('reader').classList.contains('hidden')) {
      closeBook();
    } else {
      loadLibrary();
    }
  }
  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
