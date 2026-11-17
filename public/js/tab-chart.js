/* Chart tab: the full chart, click any cell for an explanation. */
(function (global) {
  'use strict';
  const BJ = global.BJ;
  const { el, fill, chartBlock, codeClass, renderCards, traceView, ruleContext, rulesSummary, pct } = BJ.UI;
  const { Strategy, Stats, Settings } = BJ;

  let tablesEl, infoEl, selected = null, selectedTd = null;

  function init() {
    tablesEl = document.getElementById('chartTables');
    infoEl = document.getElementById('chartInfo');
    render();
    showGuide();
    Settings.onChange(() => (selected ? showCell(selected) : showGuide()));
  }

  function render() {
    fill(tablesEl, 
      ...Strategy.TABLE_ORDER.map((t) =>
        chartBlock(t, {
          crosshair: true,
          legend: true,
          onCellClick: (row, col, code, td) => select({ table: t, rowKey: row.key, col }, td),
          footer: t === 'hard' ? el('p', { class: 'bs-foot' }, 'Row 17 covers 17 and higher. Row 8 covers 8 and lower.') : null,
        })
      ),
      el('div', { class: 'bs-insurance' }, 'Insurance or even money: don’t take')
    );
  }

  function select(sel, td) {
    if (selectedTd) selectedTd.classList.remove('selected');
    selected = sel;
    selectedTd = td;
    td.classList.add('selected');
    showCell(sel);
    // On narrow screens the explanation slides up as a bottom sheet over the chart.
    if (window.matchMedia('(max-width: 1100px)').matches) {
      infoEl.classList.add('sheet');
      infoEl.scrollTop = 0;
    }
  }

  function closeCell() {
    selected = null;
    if (selectedTd) selectedTd.classList.remove('selected');
    selectedTd = null;
    infoEl.classList.remove('sheet');
    showGuide();
  }

  function showGuide() {
    fill(infoEl, 
      el('h2', null, 'How to use the chart'),
      el(
        'ol',
        { class: 'steps' },
        el('li', null, el('b', null, 'Insurance or even money?'), ' Never take it.'),
        el('li', null, el('b', null, 'Got a pair?'), ' Check ', el('em', null, 'Pair Splitting'), ' first. ', el('b', null, 'Y'), ' = split, ', el('b', null, 'Y/N'), ' = split only if Double After Split is allowed, ', el('b', null, 'N'), ' = play it as a normal total.'),
        el('li', null, el('b', null, 'Surrender offered?'), ' Check ', el('em', null, 'Late Surrender'), '. Only possible as your first decision, on two cards.'),
        el('li', null, el('b', null, 'Ace counting as 11?'), ' Use ', el('em', null, 'Soft Totals'), '. Otherwise use ', el('em', null, 'Hard Totals'), '.'),
        el('li', null, el('b', null, 'D'), ' = double if allowed, otherwise hit. ', el('b', null, 'Ds'), ' = double if allowed, otherwise stand. You can only double on your first two cards.')
      ),
      el('h3', null, 'Memory shortcuts'),
      Strategy.TABLE_ORDER.map((t) => el('div', { class: 'aid' }, el('h4', null, Strategy.TABLES[t].title), el('ul', null, Strategy.MEMORY_AIDS[t].map((a) => el('li', null, a))))),
      el('p', { class: 'muted small' }, 'Click any cell for an explanation and an example hand. Hover to trace its row and column.')
    );
  }

  function showCell(sel) {
    const T = Strategy.TABLES[sel.table];
    const row = Strategy.getRow(sel.table, sel.rowKey);
    const code = row.cells[sel.col];
    const up = Strategy.UP_LABELS[sel.col];
    const deal = Strategy.makeDeal(sel.table, sel.rowKey, sel.col, 2);
    const decision = Strategy.decide(deal.player, deal.dealer, ruleContext(deal.player));
    const statsId = sel.table === 'surrender' ? `hard:${sel.rowKey}:${up}` : `${sel.table}:${sel.rowKey}:${up}`;
    const s = Stats.cell(statsId);

    const playerCards = el('div', { class: 'cards small' });
    const dealerCards = el('div', { class: 'cards small' });
    renderCards(playerCards, deal.player);
    renderCards(dealerCards, [deal.dealer]);

    fill(infoEl, 
      el('div', { class: 'sheet-bar' },
        el('button', { class: 'link-btn guide-link', onclick: closeCell }, '← How to use the chart'),
        el('button', { class: 'sheet-close', onclick: closeCell, 'aria-label': 'Close' }, '✕')),
      el('p', { class: 'eyebrow' }, T.title),
      el('h2', null, `${row.name} vs dealer ${up}`),
      el('div', { class: 'example' }, el('div', null, el('span', { class: 'muted small' }, 'You'), playerCards), el('div', null, el('span', { class: 'muted small' }, 'Dealer'), dealerCards)),
      el(
        'div',
        { class: 'says' },
        el('span', { class: 'muted' }, 'Chart says'),
        el('span', { class: 'swatch big ' + codeClass(code) }, code === '-' ? '–' : code),
        el('span', null, Strategy.CODE_INFO[code].long)
      ),
      el('div', { class: 'says' }, el('span', { class: 'muted' }, 'With your rules'), el('strong', { class: 'action-name' }, decision.actionName)),
      el('p', { class: 'muted small' }, rulesSummary(false)),
      traceView(decision),
      el('p', { class: 'record' }, s ? `Your record here: ${s.c}/${s.n} correct (${pct(Stats.recent(statsId))} of your last ${s.r.length})` : 'You haven’t practised this spot yet.')
    );
  }

  BJ.Tabs = BJ.Tabs || {};
  BJ.Tabs.chart = { init, onHide: () => selected && closeCell(), onKey: (e) => (e.key === 'Escape' && selected ? (closeCell(), true) : false) };
})(window);
