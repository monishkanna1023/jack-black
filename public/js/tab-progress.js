/* Progress tab: per-cell accuracy heatmap, weakest spots, quiz bests. */
(function (global) {
  'use strict';
  const BJ = global.BJ;
  const { el, fill, chartBlock, pct } = BJ.UI;
  const { Strategy, Stats } = BJ;

  // Accuracy means good/bad, so it uses the reserved status colours, always with a % label.
  const BINS = [
    { min: 0.9, cls: 'heat-good', label: '90–100%' },
    { min: 0.75, cls: 'heat-warn', label: '75–89%' },
    { min: 0.5, cls: 'heat-serious', label: '50–74%' },
    { min: 0, cls: 'heat-critical', label: 'Under 50%' },
  ];
  const bin = (acc) => BINS.find((b) => acc >= b.min - 1e-9);
  const ones = (s) => (s.match(/1/g) || []).length;

  const ui = {};

  function init() {
    ui.tiles = document.getElementById('progTiles');
    ui.heat = document.getElementById('progHeat');
    ui.side = document.getElementById('progSide');
    render();
  }

  function cellName(c) {
    return `${Strategy.getRow(c.table, c.rowKey).name} vs ${Strategy.UP_LABELS[c.col]}`;
  }

  /** The correct move for a cell under the current table rules (e.g. Surrender for hard 16 vs 10). */
  function answerFor(table, rowKey, col) {
    const deal = Strategy.makeDeal(table, rowKey, col, 2);
    return Strategy.decide(deal.player, deal.dealer, BJ.UI.ruleContext(deal.player)).actionName;
  }

  function render() {
    const cells = Strategy.allCells();
    const practised = cells.filter((c) => Stats.cell(c.id)).length;
    const mastered = cells.filter((c) => Stats.isMastered(c.id)).length;
    const t = Stats.data.totals;
    const ins = Stats.data.insurance;
    const tile = (label, value, sub, meter) =>
      el('div', { class: 'tile' }, el('span', { class: 'tile-label' }, label), el('strong', { class: 'tile-value' }, value), sub ? el('span', { class: 'tile-sub' }, sub) : null, meter != null ? el('div', { class: 'meter' }, el('i', { style: `width:${meter * 100}%` })) : null);

    fill(ui.tiles, 
      tile('Spots mastered', `${mastered} / ${cells.length}`, 'last 3 tries all correct', mastered / cells.length),
      tile('Spots practised', `${practised} / ${cells.length}`, null, practised / cells.length),
      tile('Decisions logged', t.n.toLocaleString(), 'drill + play'),
      tile('Overall accuracy', t.n ? pct(t.c / t.n) : '–', 'all time'),
      tile('Insurance declined', ins.n ? `${ins.c} / ${ins.n}` : '–', 'should be every time')
    );

    fill(ui.heat, 
      el(
        'div',
        { class: 'heat-legend' },
        el('span', { class: 'muted small' }, 'Accuracy over your last ', Stats.RECENT, ' tries per spot:'),
        BINS.map((b) => el('span', { class: 'bs-legend-item' }, el('span', { class: 'swatch ' + b.cls }, '%'), b.label)),
        el('span', { class: 'bs-legend-item' }, el('span', { class: 'swatch heat-none' }), 'Not practised')
      ),
      el(
        'div',
        { class: 'heat-grid' },
        ['pairs', 'soft', 'hard'].map((table) =>
          chartBlock(table, {
            cell: (row, col, code) => {
              const id = `${table}:${row.key}:${Strategy.UP_LABELS[col]}`;
              const s = Stats.cell(id);
              const name = `${row.name} vs ${Strategy.UP_LABELS[col]} (answer: ${answerFor(table, row.key, col)})`;
              if (!s) return { text: '', cls: 'heat-none', tip: `${name}: not practised yet`, aria: 'not practised' };
              const acc = Stats.recent(id);
              const m = Stats.isMastered(id);
              return {
                text: String(Math.round(acc * 100)),
                cls: bin(acc).cls + (m ? ' mastered' : ''),
                tip: `${name}. Last ${s.r.length}: ${ones(s.r)} right. All time: ${s.c}/${s.n}.${m ? ' Mastered.' : ''}`,
                aria: `${Math.round(acc * 100)} percent`,
              };
            },
          })
        )
      )
    );

    renderSide();
  }

  function renderSide() {
    const weak = Strategy.allCells()
      .map((c) => ({ ...c, s: Stats.cell(c.id), acc: Stats.recent(c.id) }))
      .filter((c) => c.s && c.acc < 1)
      .sort((a, b) => a.acc - b.acc || b.s.n - a.s.n)
      .slice(0, 10);

    fill(ui.side, 
      el('h2', null, 'Weakest spots'),
      weak.length
        ? el(
            'ul',
            { class: 'weak-list' },
            weak.map((c) =>
              el(
                'li',
                null,
                el('span', { class: 'swatch ' + bin(c.acc).cls }, Math.round(c.acc * 100)),
                el('span', { class: 'weak-name' }, cellName(c), el('small', null, `answer: ${answerFor(c.table, c.rowKey, c.col)}`)),
                el('button', { class: 'btn small', onclick: () => practise(c) }, 'Practise')
              )
            )
          )
        : el('p', { class: 'muted' }, Stats.data.totals.n ? 'No misses in your recent tries. Nice.' : 'Nothing yet. Do some drills and your weak spots will show up here.'),
      el('button', { class: 'btn primary', onclick: drillWeak }, 'Drill with focus on weak spots'),
      el('h3', null, 'Fill the Chart: best scores'),
      el('ul', { class: 'best-list' }, Strategy.TABLE_ORDER.map((t) => el('li', null, el('span', null, Strategy.TABLES[t].title), el('strong', null, Stats.quizBest(t) != null ? pct(Stats.quizBest(t)) : '–')))),
      el('h3', null, 'Ready for counting?'),
      el('p', { class: 'muted small' }, 'A good benchmark: every spot mastered, 100% on each Fill the Chart table, and 98%+ accuracy in Play over a few hundred decisions, at a quick pace (under ~2s per drill hand).'),
      el('button', { class: 'btn danger small', onclick: reset }, 'Reset all progress')
    );
  }

  function practise(c) {
    BJ.App.showTab('drill');
    BJ.Tabs.drill.next(c);
  }

  function drillWeak() {
    BJ.Settings.set('drillAdaptive', true);
    BJ.App.showTab('drill');
  }

  function reset() {
    if (!confirm('Reset all progress? This clears every logged decision and quiz score.')) return;
    Stats.reset();
    render();
  }

  BJ.Tabs = BJ.Tabs || {};
  BJ.Tabs.progress = { init, onShow: render };
})(window);
