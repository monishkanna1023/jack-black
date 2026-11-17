/* Shared DOM helpers: elements, cards, chart tables, feedback traces, tooltips. */
(function (global) {
  'use strict';
  const BJ = global.BJ;
  const { Cards, Strategy, Settings } = BJ;

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'dataset') {
          for (const [dk, dv] of Object.entries(v)) if (dv != null) e.dataset[dk] = dv;
        }
        else if (k === 'style') e.style.cssText = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }

  /** Replace a node's children. Like replaceChildren, but flattens arrays and skips null/false. */
  function fill(node, ...children) {
    node.replaceChildren(
      ...children
        .flat(Infinity)
        .filter((c) => c != null && c !== false)
        .map((c) => (c.nodeType ? c : document.createTextNode(String(c))))
    );
    return node;
  }

  const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const pct = (x) => (x == null ? '–' : Math.round(x * 100) + '%');

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------
  const dealt = new WeakSet(); // cards already shown face-up or face-down (no re-animation)
  const shownHidden = new WeakSet(); // cards that were rendered face-down

  function cardEl(card, opts) {
    opts = opts || {};
    let e;
    if (opts.hidden) {
      e = el('div', { class: 'card back', 'aria-label': 'Face-down card' });
      shownHidden.add(card);
    } else {
      const red = Cards.isRed(card);
      e = el(
        'div',
        { class: 'card' + (red ? ' red' : ''), 'aria-label': `${card.rank} of ${Cards.SUIT_NAMES[card.suit]}` },
        el('span', { class: 'corner tl' }, el('b', null, card.rank), el('i', null, card.suit)),
        el('span', { class: 'pip' }, card.suit),
        el('span', { class: 'corner br' }, el('b', null, card.rank), el('i', null, card.suit))
      );
      if (shownHidden.has(card)) {
        shownHidden.delete(card);
        e.classList.add('flip');
        if (opts.delay != null) e.style.animationDelay = opts.delay + 's';
      }
    }
    if (!dealt.has(card)) {
      dealt.add(card);
      e.classList.add('deal');
      if (opts.delay != null) e.style.animationDelay = opts.delay + 's';
    }
    return e;
  }

  /**
   * Render cards into a container. Newly-seen cards animate in one after another.
   * Returns the time (s) until the last new card has landed.
   */
  /** Would this card animate if rendered now (never shown, or face-down and now being turned up)? */
  function isFresh(card, hidden) {
    return !dealt.has(card) || (!hidden && shownHidden.has(card));
  }

  /**
   * Render cards into a container. New cards animate in one after another, or at the
   * times given by opts.delayOf(card). Returns the time (s) until the last new card has landed.
   */
  function renderCards(container, cards, opts) {
    opts = opts || {};
    container.replaceChildren();
    let k = 0;
    let end = 0;
    const step = opts.step != null ? opts.step : 0.18;
    cards.forEach((c, i) => {
      const hidden = opts.hideIndex === i;
      let delay = null;
      if (isFresh(c, hidden)) {
        delay = opts.delayOf ? opts.delayOf(c) || 0 : k++ * step;
        end = Math.max(end, delay + 0.3);
      }
      container.append(cardEl(c, { hidden, delay }));
    });
    return end;
  }

  /** "Soft 18", "Hard 16", "Bust (24)", "Blackjack". */
  function totalLabel(cards, opts) {
    const t = Cards.handTotal(cards);
    if (Cards.isBlackjack(cards) && !(opts && opts.noBlackjack)) return 'Blackjack';
    if (t.total > 21) return `Bust (${t.total})`;
    if (t.soft && t.total < 21) return `Soft ${t.total}`;
    return String(t.total);
  }

  // ---------------------------------------------------------------------------
  // Chart tables
  // ---------------------------------------------------------------------------
  const CODE_CLASS = { Y: 'c-green', 'Y/N': 'c-teal', N: 'c-white', H: 'c-white', S: 'c-yellow', D: 'c-green', Ds: 'c-teal', SUR: 'c-green', '-': 'c-white' };
  const codeClass = (code) => CODE_CLASS[code] || '';
  const codeText = (code) => (code === '-' ? '' : code);

  /**
   * One chart table.
   * opts.cell(row, col, code) -> { text, cls, tip }  (default: the chart code)
   * opts.onCellClick(row, col, code, td)
   * opts.crosshair: highlight row + column on hover
   */
  function chartTable(tableName, opts) {
    opts = opts || {};
    const T = Strategy.TABLES[tableName];
    const head = el('tr', null, el('th', { class: 'corner-cell' }), Strategy.UP_LABELS.map((l, i) => el('th', { scope: 'col', dataset: { col: i } }, l)));
    const body = T.rows.map((row) =>
      el(
        'tr',
        { dataset: { row: row.key } },
        el('th', { scope: 'row', title: row.name }, row.label),
        row.cells.map((code, col) => {
          const info = opts.cell ? opts.cell(row, col, code) : { text: codeText(code), cls: codeClass(code) };
          const td = el(
            'td',
            {
              class: 'cell ' + (info.cls || ''),
              dataset: { row: row.key, col, tip: info.tip || null },
              tabindex: opts.onCellClick ? 0 : null,
              'aria-label': `${row.name} vs ${Strategy.UP_LABELS[col]}: ${info.aria || info.text || 'blank'}`,
            },
            info.text
          );
          if (opts.onCellClick) {
            td.addEventListener('click', () => opts.onCellClick(row, col, code, td));
            td.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                opts.onCellClick(row, col, code, td);
              }
            });
          }
          return td;
        })
      )
    );
    const table = el('table', { class: `bs-table t-${tableName}` }, el('thead', null, head), el('tbody', null, body));
    if (opts.crosshair) addCrosshair(table);
    return table;
  }

  function addCrosshair(table) {
    let lit = [];
    const clear = () => {
      for (const n of lit) n.classList.remove('xh');
      lit = [];
    };
    table.addEventListener('mouseover', (e) => {
      const td = e.target.closest('td.cell');
      clear();
      if (!td) return;
      const { row, col } = td.dataset;
      lit = [
        ...table.querySelectorAll(`td.cell[data-row="${row}"], td.cell[data-col="${col}"]`),
        table.querySelector(`thead th[data-col="${col}"]`),
        td.parentElement.querySelector('th'),
      ].filter(Boolean);
      for (const n of lit) n.classList.add('xh');
    });
    table.addEventListener('mouseleave', clear);
  }

  function legend(tableName) {
    return el(
      'div',
      { class: 'bs-legend' },
      el('span', { class: 'bs-legend-title' }, 'Key'),
      Strategy.LEGEND[tableName].map((code) =>
        el('span', { class: 'bs-legend-item' }, el('span', { class: 'swatch ' + codeClass(code) }, code), Strategy.CODE_INFO[code].long)
      )
    );
  }

  /** Table with the chart's title bar, "Dealer upcard" bar and (optionally) its key. */
  function chartBlock(tableName, opts) {
    opts = opts || {};
    const T = Strategy.TABLES[tableName];
    return el(
      'div',
      { class: 'bs-block', dataset: { table: tableName } },
      el('div', { class: 'bs-title' }, opts.title || T.title),
      el('div', { class: 'bs-sub' }, 'Dealer upcard'),
      el('div', { class: 'bs-scroll' }, chartTable(tableName, opts)),
      opts.legend ? legend(tableName) : null,
      opts.footer || null
    );
  }

  /** Small one-row slice of a table with the deciding column highlighted. */
  function traceRow(stepInfo) {
    const row = Strategy.getRow(stepInfo.table, stepInfo.rowKey);
    const head = el('tr', null, el('th', { class: 'corner-cell' }), Strategy.UP_LABELS.map((l, i) => el('th', { class: i === stepInfo.col ? 'hl' : null }, l)));
    const tr = el(
      'tr',
      null,
      el('th', null, row.label),
      row.cells.map((code, i) => el('td', { class: `cell ${codeClass(code)}${i === stepInfo.col ? ' hl' : ''}` }, codeText(code)))
    );
    return el('table', { class: 'bs-table mini' }, el('thead', null, head), el('tbody', null, tr));
  }

  /** Feedback block listing each chart lookup that led to the answer. */
  function traceView(decision, opts) {
    opts = opts || {};
    return el(
      'div',
      { class: 'trace' },
      decision.trace.map((s) => {
        if (!s.table) return el('div', { class: 'trace-step' }, el('p', { class: 'trace-note' }, s.note));
        const tip = Strategy.ROW_TIPS[`${s.table}:${s.rowKey}`];
        return el(
          'div',
          { class: 'trace-step' },
          el('div', { class: 'trace-head' }, el('span', { class: 'trace-table' }, Strategy.TABLES[s.table].title), el('span', { class: 'swatch ' + codeClass(s.code) }, s.code === '-' ? '–' : s.code)),
          el('div', { class: 'bs-scroll' }, traceRow(s)),
          el('p', { class: 'trace-note' }, s.note),
          tip && !opts.noTips ? el('p', { class: 'trace-tip' }, 'Rule of thumb: ', tip) : null
        );
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Rules helpers
  // ---------------------------------------------------------------------------
  /** What the current table rules allow for a fresh (un-split) hand. */
  function ruleContext(cards) {
    const s = Settings.data;
    const two = cards.length === 2;
    const t = Cards.handTotal(cards);
    return {
      canSplit: two && Cards.isPair(cards),
      canDouble: two && Strategy.canDoubleByRule(t.total, t.soft, s.doubleRule),
      canSurrender: two && s.surrender,
      das: s.das,
    };
  }

  const DOUBLE_LABEL = { any: 'Double any 2 cards', '9-11': 'Double 9–11 only', '10-11': 'Double 10–11 only' };
  function rulesSummary(includePlay) {
    const s = Settings.data;
    const parts = [s.das ? 'DAS' : 'No DAS', s.surrender ? 'Late surrender' : 'No surrender', DOUBLE_LABEL[s.doubleRule]];
    if (includePlay) parts.unshift('1 deck', s.h17 ? 'Dealer hits soft 17' : 'Dealer stands on soft 17', s.bjPayout === 1.5 ? 'BJ pays 3:2' : 'BJ pays 6:5');
    return parts.join(' · ');
  }

  // ---------------------------------------------------------------------------
  // Tooltip for any element with data-tip
  // ---------------------------------------------------------------------------
  let tipEl = null;
  function initTooltips() {
    tipEl = el('div', { class: 'tooltip', role: 'tooltip', hidden: true });
    document.body.append(tipEl);
    const show = (e) => {
      const t = e.target.closest('[data-tip]');
      if (!t) {
        tipEl.hidden = true;
        return;
      }
      tipEl.textContent = t.dataset.tip;
      tipEl.hidden = false;
      const r = t.getBoundingClientRect();
      const w = tipEl.offsetWidth;
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      const top = r.top - tipEl.offsetHeight - 8;
      tipEl.style.left = left + 'px';
      tipEl.style.top = (top < 8 ? r.bottom + 8 : top) + 'px';
    };
    document.addEventListener('mouseover', show);
    // Touch screens have no hover: tap a cell to see its tooltip, tap elsewhere to hide it.
    document.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && show(e));
    document.addEventListener('scroll', () => (tipEl.hidden = true), true);
  }

  /** Two-way bind every [data-setting] control inside root to Settings. */
  function bindSettings(root) {
    for (const input of root.querySelectorAll('[data-setting]')) {
      const k = input.dataset.setting;
      const sync = () => {
        if (input.type === 'checkbox') input.checked = !!Settings.get(k);
        else input.value = String(Settings.get(k));
      };
      sync();
      input.addEventListener('change', () => Settings.set(k, Settings.coerce(k, input.type === 'checkbox' ? input.checked : input.value)));
      Settings.onChange((key) => key === k && sync());
    }
  }

  /** Segmented control: buttons with data-value inside `root`, bound to a setting. */
  function bindSegmented(root, key, onPick) {
    const btns = [...root.querySelectorAll('button[data-value]')];
    const sync = () => btns.forEach((b) => b.classList.toggle('on', b.dataset.value === String(Settings.get(key))));
    btns.forEach((b) =>
      b.addEventListener('click', () => {
        Settings.set(key, Settings.coerce(key, b.dataset.value));
        sync();
        if (onPick) onPick(b.dataset.value);
      })
    );
    Settings.onChange((k) => k === key && sync());
    sync();
  }

  BJ.UI = {
    el,
    fill,
    money,
    pct,
    cardEl,
    renderCards,
    isFresh,
    totalLabel,
    codeClass,
    codeText,
    chartTable,
    chartBlock,
    legend,
    traceRow,
    traceView,
    ruleContext,
    rulesSummary,
    initTooltips,
    bindSettings,
    bindSegmented,
  };
})(window);
