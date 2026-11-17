/* Fill the Chart tab: a blank table, fill it in cell by cell from memory. */
(function (global) {
  'use strict';
  const BJ = global.BJ;
  const { el, fill, chartBlock, codeClass, codeText, pct } = BJ.UI;
  const { Strategy, Stats, Settings, Cards } = BJ;

  const ui = {};
  const state = { table: 'hard', queue: [], idx: 0, results: {}, done: false, t0: 0, full: true, last: null, newBest: false };
  const key = (rowKey, col) => `${rowKey}:${col}`;
  const codeLabel = (code) => (code === '-' ? '—' : code);

  function init() {
    ui.board = document.getElementById('quizBoard');
    ui.prompt = document.getElementById('quizPrompt');
    ui.pad = document.getElementById('quizPad');
    ui.score = document.getElementById('quizScore');
    BJ.UI.bindSegmented(document.getElementById('quizTableSeg'), 'quizTable', () => start());
    BJ.UI.bindSegmented(document.getElementById('quizOrderSeg'), 'quizOrder', () => start());
    document.getElementById('quizRestart').addEventListener('click', () => start());
    start();
  }

  function start(subset) {
    const table = Settings.get('quizTable');
    const T = Strategy.TABLES[table];
    const q = subset ? subset.slice() : T.rows.flatMap((r) => r.cells.map((_, col) => ({ rowKey: r.key, col })));
    if (Settings.get('quizOrder') === 'random') Cards.shuffle(q);
    Object.assign(state, { table, queue: q, idx: 0, results: {}, done: false, t0: Date.now(), full: !subset, last: null, newBest: false });
    state.inQueue = new Set(q.map((c) => key(c.rowKey, c.col)));
    renderPad();
    render();
  }

  function current() {
    return state.done ? null : state.queue[state.idx];
  }

  function answer(code) {
    const c = current();
    if (!c) return;
    const right = Strategy.lookup(state.table, c.rowKey, c.col);
    const ok = code === right;
    state.results[key(c.rowKey, c.col)] = { given: code, ok };
    state.last = { ...c, given: code, right, ok };
    state.idx++;
    if (state.idx >= state.queue.length) finish();
    render();
  }

  function finish() {
    state.done = true;
    state.secs = Math.round((Date.now() - state.t0) / 1000);
    const { correct, total } = tally();
    if (state.full) state.newBest = Stats.setQuizBest(state.table, correct / total);
  }

  function tally() {
    const r = Object.values(state.results);
    return { correct: r.filter((x) => x.ok).length, answered: r.length, total: state.queue.length };
  }

  function mistakes() {
    return state.queue.filter((c) => {
      const r = state.results[key(c.rowKey, c.col)];
      return r && !r.ok;
    });
  }

  function cellName(c) {
    return `${Strategy.getRow(state.table, c.rowKey).name} vs ${Strategy.UP_LABELS[c.col]}`;
  }

  // ---------------------------------------------------------------------------
  function render() {
    const cur = current();
    fill(ui.board, 
      chartBlock(state.table, {
        cell: (row, col, code) => {
          const r = state.results[key(row.key, col)];
          if (r) {
            if (r.ok) return { text: codeText(code), cls: codeClass(code), aria: code };
            return {
              text: el('span', null, codeText(code) || '–', el('s', { class: 'was' }, codeLabel(r.given))),
              cls: codeClass(code) + ' wrong',
              tip: `You said ${codeLabel(r.given)}, the chart says ${codeLabel(code)}`,
              aria: `${code}, you said ${r.given}`,
            };
          }
          if (cur && cur.rowKey === row.key && cur.col === col) return { text: '?', cls: 'current', aria: 'current question' };
          if (state.inQueue.has(key(row.key, col))) return { text: '', cls: 'blank', aria: 'not answered yet' };
          return { text: codeText(code), cls: codeClass(code) + ' faded', aria: code };
        },
      })
    );
    renderPrompt(cur);
    renderScore();
    // Keep the highlighted cell on screen (matters on phones, where the answer pad covers the bottom).
    const curTd = ui.board.querySelector('td.current');
    if (curTd && !document.getElementById('tab-quiz').hidden) curTd.scrollIntoView({ block: 'nearest' });
    for (const b of ui.pad.querySelectorAll('button')) b.disabled = state.done;
  }

  function renderPrompt(cur) {
    const last = state.last
      ? el(
          'p',
          { class: 'quiz-last ' + (state.last.ok ? 'ok' : 'bad') },
          state.last.ok ? '✓ ' : '✗ ',
          `${cellName(state.last)}: `,
          el('b', null, codeLabel(state.last.right)),
          state.last.ok ? '' : ` (you said ${codeLabel(state.last.given)})`
        )
      : null;

    if (cur) {
      fill(ui.prompt, 
        el('p', { class: 'eyebrow' }, `${Strategy.TABLES[state.table].title} · cell ${state.idx + 1} of ${state.queue.length}`),
        el('h2', { class: 'quiz-q' }, cellName(cur)),
        el('p', { class: 'muted' }, 'What goes in the highlighted cell?'),
        last
      );
      return;
    }
    const { correct, total } = tally();
    const miss = mistakes();
    const m = Math.floor(state.secs / 60);
    const sec = String(state.secs % 60).padStart(2, '0');
    fill(ui.prompt, 
      el('p', { class: 'eyebrow' }, `${Strategy.TABLES[state.table].title} · finished`),
      el('h2', { class: 'quiz-q' }, `${correct} / ${total} correct (${pct(correct / total)})`),
      el('p', { class: 'muted' }, `Time ${m}:${sec}`, state.newBest ? ' · New personal best!' : ''),
      miss.length
        ? el(
            'div',
            null,
            el('h3', null, 'Mistakes'),
            el('ul', { class: 'miss-list' }, miss.map((c) => el('li', null, cellName(c), ': ', el('b', null, codeLabel(Strategy.lookup(state.table, c.rowKey, c.col))), ` (you said ${codeLabel(state.results[key(c.rowKey, c.col)].given)})`))),
            el('button', { class: 'btn primary', onclick: () => start(miss) }, `Retry ${miss.length} mistake${miss.length > 1 ? 's' : ''}`)
          )
        : el('p', { class: 'quiz-perfect' }, state.full ? 'Perfect. You know this table cold.' : 'All fixed.'),
      el('button', { class: 'btn', onclick: () => start() }, 'Start over')
    );
  }

  function renderPad() {
    const T = Strategy.TABLES[state.table];
    fill(ui.pad, 
      ...T.codes.map((code, i) =>
        el(
          'button',
          { class: 'pad-btn', onclick: () => answer(code) },
          el('span', { class: 'swatch ' + codeClass(code) }, codeLabel(code)),
          el('span', { class: 'pad-desc' }, Strategy.CODE_INFO[code].short),
          el('kbd', null, String(i + 1))
        )
      )
    );
  }

  function renderScore() {
    const { correct, answered, total } = tally();
    const best = Stats.quizBest(state.table);
    fill(ui.score, 
      el('div', { class: 'meter' }, el('i', { style: `width:${(answered / total) * 100}%` })),
      el('p', { class: 'muted small' }, `${answered} answered · ${correct} correct${answered ? ` (${pct(correct / answered)})` : ''}`, best != null ? ` · Best full run: ${pct(best)}` : '')
    );
  }

  const LETTERS = { pairs: { y: 'Y', n: 'N' }, soft: { h: 'H', s: 'S', d: 'D' }, hard: { h: 'H', s: 'S', d: 'D' }, surrender: {} };
  function onKey(e) {
    const codes = Strategy.TABLES[state.table].codes;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= codes.length) {
      answer(codes[n - 1]);
      return true;
    }
    const letter = LETTERS[state.table][e.key.toLowerCase()];
    if (letter) {
      answer(letter);
      return true;
    }
    return false;
  }

  BJ.Tabs = BJ.Tabs || {};
  BJ.Tabs.quiz = { init, onKey };
})(window);
