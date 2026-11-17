/* Drill tab: random spot from the chart, pick the move, instant feedback. */
(function (global) {
  'use strict';
  const BJ = global.BJ;
  const { el, fill, renderCards, traceView, ruleContext, rulesSummary, pct } = BJ.UI;
  const { Strategy, Stats, Settings } = BJ;

  const ui = {};
  const session = { n: 0, c: 0, streak: 0, best: 0, ms: 0 };
  let cur = null; // { cell, deal, ctx, decision, answered, t0 }
  let autoTimer = null;
  let lastCellId = null;

  function init() {
    ui.root = document.getElementById('tab-drill');
    ui.dealer = document.getElementById('drillDealer');
    ui.player = document.getElementById('drillPlayer');
    ui.label = document.getElementById('drillHandLabel');
    ui.feedback = document.getElementById('drillFeedback');
    ui.stats = document.getElementById('drillStats');
    ui.rules = document.getElementById('drillRules');
    ui.verdict = document.getElementById('drillVerdict');
    ui.felt = ui.root.querySelector('.felt');
    // After answering, tapping anywhere on the table deals the next hand (handy on phones).
    ui.felt.addEventListener('click', (e) => {
      if (cur && cur.answered && !e.target.closest('button')) next();
    });
    ui.buttons = [...ui.root.querySelectorAll('#drillActions button[data-action]')];
    ui.buttons.forEach((b) => b.addEventListener('click', () => answer(b.dataset.action)));
    document.getElementById('drillNext').addEventListener('click', next);
    BJ.UI.bindSettings(ui.root);

    Settings.onChange((k) => {
      if (['drillPairs', 'drillSoft', 'drillHard', 'drill3Card', 'das', 'surrender', 'doubleRule'].includes(k)) next();
      if (k === 'showTotals') renderLabel();
    });
    renderStats();
    next();
  }

  function activeTables() {
    const t = [];
    if (Settings.get('drillPairs')) t.push('pairs');
    if (Settings.get('drillSoft')) t.push('soft');
    if (Settings.get('drillHard')) t.push('hard');
    return t;
  }

  function pickCell() {
    let tables = activeTables();
    if (!tables.length) tables = ['pairs', 'soft', 'hard']; // nothing ticked = everything
    const cells = Strategy.allCells(tables).filter((c) => c.id !== lastCellId);
    const adaptive = Settings.get('drillAdaptive');
    const weights = cells.map((c) => (adaptive ? Stats.weight(c.id) : 1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cells.length; i++) {
      r -= weights[i];
      if (r <= 0) return cells[i];
    }
    return cells[cells.length - 1];
  }

  /** Optionally ask only about one cell (used by Progress → "practise this"). */
  function next(forceCell) {
    clearTimeout(autoTimer);
    const cell = forceCell && forceCell.table ? forceCell : pickCell();
    lastCellId = cell.id;
    const three = Settings.get('drill3Card') && Strategy.hasThreeCardVersion(cell.table, cell.rowKey) && Math.random() < 0.35;
    const deal = Strategy.makeDeal(cell.table, cell.rowKey, cell.col, three ? 3 : 2);
    const ctx = ruleContext(deal.player);
    const decision = Strategy.decide(deal.player, deal.dealer, ctx);
    cur = { cell, deal, ctx, decision, answered: false, t0: performance.now() };

    renderCards(ui.dealer, [deal.dealer, { rank: '?', suit: '?' }], { hideIndex: 1 });
    renderCards(ui.player, deal.player);
    renderLabel();
    ui.rules.textContent = rulesSummary(false) + (deal.player.length > 2 ? ' · You’ve already hit, so no doubling or surrender' : '');

    const legal = { H: true, S: true, D: ctx.canDouble, P: ctx.canSplit, R: ctx.canSurrender };
    for (const b of ui.buttons) {
      b.disabled = !legal[b.dataset.action];
      b.classList.remove('right', 'wrong', 'dim');
    }
    fill(
      ui.feedback,
      el('p', { class: 'muted' }, 'What does basic strategy say?', el('span', { class: 'kbd-help' }, ' Keys: ', el('kbd', null, 'H'), ' hit · ', el('kbd', null, 'S'), ' stand · ', el('kbd', null, 'D'), ' double · ', el('kbd', null, 'P'), ' split · ', el('kbd', null, 'R'), ' surrender'))
    );
    ui.feedback.className = 'feedback side-panel';
    ui.verdict.className = 'verdict';
    fill(ui.verdict);
    ui.felt.classList.remove('tappable');
  }

  function renderLabel() {
    if (!cur) return;
    const d = cur.decision;
    const show = Settings.get('showTotals') || cur.answered;
    let text = d.handName;
    if (d.pair) text += ` (${d.soft ? 'soft' : 'hard'} ${d.total})`;
    ui.label.textContent = show ? `${text} vs ${d.upLabel}` : 'Your hand';
  }

  function answer(action) {
    if (!cur || cur.answered) return;
    const btn = ui.buttons.find((b) => b.dataset.action === action);
    if (!btn || btn.disabled) return;
    cur.answered = true;
    const ms = performance.now() - cur.t0;
    const d = cur.decision;
    const ok = action === d.action;

    Stats.record(d.cellId, ok);
    session.n++;
    session.ms += Math.min(ms, 30000);
    if (ok) {
      session.c++;
      session.streak++;
      session.best = Math.max(session.best, session.streak);
    } else {
      session.streak = 0;
    }
    renderStats();
    renderLabel();

    for (const b of ui.buttons) {
      if (b.dataset.action === d.action) b.classList.add('right');
      else if (b.dataset.action === action) b.classList.add('wrong');
      else b.classList.add('dim');
    }

    const auto = ok && Settings.get('drillAutoNext');
    ui.feedback.className = 'feedback side-panel ' + (ok ? 'ok' : 'bad');
    fill(ui.feedback, 
      el(
        'div',
        { class: 'fb-head' },
        el('span', { class: 'fb-icon', 'aria-hidden': 'true' }, ok ? '✓' : '✗'),
        ok ? el('span', null, 'Correct: ', el('b', null, d.actionName)) : el('span', null, 'You chose ', el('b', null, Strategy.ACTION_NAMES[action]), '. Basic strategy says ', el('b', null, d.actionName), '.')
      ),
      el('p', { class: 'fb-sub' }, `${d.handName} vs dealer ${d.upLabel}`),
      traceView(d),
      el('p', { class: 'fb-next muted' }, auto ? 'Next hand coming up…' : el('span', null, el('span', { class: 'kbd-help' }, 'Press ', el('kbd', null, 'Space'), ' or '), 'tap the table for the next hand'))
    );
    ui.verdict.className = 'verdict show ' + (ok ? 'ok' : 'bad');
    fill(ui.verdict, ok ? `✓ ${d.actionName}` : `✗ Basic strategy: ${d.actionName}`);
    ui.felt.classList.add('tappable');
    if (auto) autoTimer = setTimeout(next, 1100);
  }

  function renderStats() {
    const s = session;
    const item = (label, value) => el('div', { class: 'stat' }, el('span', null, label), el('strong', null, value));
    fill(ui.stats, 
      item('Hands', s.n),
      item('Accuracy', s.n ? pct(s.c / s.n) : '–'),
      item('Streak', s.streak),
      item('Best streak', s.best),
      item('Avg time', s.n ? (s.ms / s.n / 1000).toFixed(1) + 's' : '–')
    );
  }

  const KEYS = { h: 'H', s: 'S', d: 'D', p: 'P', r: 'R' };
  function onKey(e) {
    const k = e.key.toLowerCase();
    if (KEYS[k]) {
      answer(KEYS[k]);
      return true;
    }
    if (k === ' ' || k === 'enter' || k === 'n') {
      if (cur && cur.answered) next();
      return true;
    }
    return false;
  }

  function onHide() {
    clearTimeout(autoTimer);
  }

  function onShow() {
    if (cur && cur.answered) next();
  }

  BJ.Tabs = BJ.Tabs || {};
  BJ.Tabs.drill = { init, onKey, onShow, onHide, next };
})(window);
