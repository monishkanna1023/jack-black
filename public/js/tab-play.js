/* Play tab: real single-deck blackjack with a coach that checks every decision. */
(function (global) {
  'use strict';
  const BJ = global.BJ;
  const { el, fill, renderCards, traceView, totalLabel, money, pct, rulesSummary } = BJ.UI;
  const { Strategy, Stats, Settings, Cards, Store } = BJ;

  const KEY = 'bjTrainer.play.v1';
  const START_BANKROLL = 1000;
  const MIN_BET = 5;
  const RESULT_LABEL = { blackjack: 'Blackjack', win: 'Win', lose: 'Lose', push: 'Push', bust: 'Bust', surrender: 'Surrendered' };

  const ui = {};
  const session = { n: 0, c: 0, rounds: 0, net: 0 };
  let game;
  let bet = 10;
  let feedback = null;
  let missedAt = null; // decision already scored as a miss (strict mode retry)
  let hintAt = null; // decision where the hint was shown (not scored)

  const rules = () => {
    const s = Settings.data;
    return { h17: s.h17, das: s.das, surrender: s.surrender, doubleRule: s.doubleRule, bjPayout: s.bjPayout };
  };
  const save = () => Store.write(KEY, { bankroll: game.bankroll, bet });
  const pointKey = () => `${game.round}:${game.active}:${game.activeHand.cards.length}:${game.hands.length}`;
  const strict = () => Settings.get('playMode') === 'strict';

  function init() {
    const saved = Store.read(KEY, null);
    game = new BJ.Game(rules(), { bankroll: saved && saved.bankroll >= MIN_BET ? saved.bankroll : START_BANKROLL });
    if (saved && saved.bet > 0) bet = saved.bet;

    for (const id of ['playBankroll', 'playBet', 'playDeck', 'playDeckBar', 'playDeckCut', 'playDealer', 'playDealerTotal', 'playHands', 'playMsg', 'playCoach', 'playBetting', 'playInsurance', 'playMoves', 'playInsText', 'playInsYes', 'playDeal'])
      ui[id] = document.getElementById(id);

    document.querySelectorAll('#tab-play [data-chip]').forEach((b) =>
      b.addEventListener('click', () => {
        if (game.inRound) return;
        bet = b.dataset.chip === 'clear' ? 0 : Math.min(game.bankroll, bet + Number(b.dataset.chip));
        save();
        render();
      })
    );
    document.querySelectorAll('#playMoves [data-action]').forEach((b) => b.addEventListener('click', () => act(b.dataset.action)));
    ui.playDeal.addEventListener('click', deal);
    ui.playInsYes.addEventListener('click', () => insurance(true));
    document.getElementById('playInsNo').addEventListener('click', () => insurance(false));
    document.getElementById('playReset').addEventListener('click', resetBankroll);
    document.getElementById('playHintBtn').addEventListener('click', hint);
    ui.playVerdict = document.getElementById('playVerdict');
    BJ.UI.bindSegmented(document.getElementById('playModeSeg'), 'playMode', () => render());

    Settings.onChange((k) => {
      if (['h17', 'das', 'surrender', 'doubleRule', 'bjPayout'].includes(k) && !game.inRound) game.setRules(rules());
      render();
    });
    render();
  }

  // ---------------------------------------------------------------------------
  function deal() {
    if (game.inRound) return;
    if (bet < MIN_BET) return note(`Minimum bet is ${money(MIN_BET)}. Click a chip.`);
    if (bet > game.bankroll) bet = game.bankroll;
    if (bet < MIN_BET) return note('Out of money. Reset your bankroll to keep practising.');
    game.setRules(rules());
    game.deal(bet);
    feedback = game.justShuffled ? { kind: 'info', text: 'Fresh deck: the cards were reshuffled.' } : null;
    missedAt = hintAt = null;
    afterChange();
  }

  function act(a) {
    if (game.phase !== 'player' || !game.available()[a]) return;
    const h = game.activeHand;
    const point = pointKey();
    const d = Strategy.decide(h.cards, game.dealerUp, game.strategyContext());
    const ok = a === d.action;
    const scored = point !== missedAt && point !== hintAt;
    const handNo = game.hands.length > 1 ? game.active + 1 : null;

    if (!ok && strict()) {
      if (scored) record(d.cellId, false);
      missedAt = point;
      feedback = { kind: 'bad', strict: true, chosen: a, decision: d, handNo };
      return render();
    }
    if (scored) record(d.cellId, ok);
    feedback = { kind: ok ? 'ok' : 'bad', chosen: a, decision: d, handNo, retried: point === missedAt, hinted: point === hintAt };
    game.act(a);
    afterChange();
  }

  function insurance(take) {
    if (game.phase !== 'insurance') return;
    const point = `${game.round}:ins`;
    const evenMoney = Cards.isBlackjack(game.hands[0].cards);
    const scored = point !== missedAt && point !== hintAt;
    if (take && strict()) {
      if (scored) recordInsurance(false);
      missedAt = point;
      feedback = { kind: 'bad', strict: true, insurance: true, evenMoney };
      return render();
    }
    if (scored) recordInsurance(!take);
    feedback = { kind: take ? 'bad' : 'ok', insurance: true, evenMoney, retried: point === missedAt };
    game.insurance(take && game.canAffordInsurance());
    afterChange();
  }

  function hint() {
    if (game.phase === 'insurance') {
      hintAt = `${game.round}:ins`;
      feedback = { kind: 'hint', insurance: true, evenMoney: Cards.isBlackjack(game.hands[0].cards) };
    } else if (game.phase === 'player') {
      hintAt = pointKey();
      feedback = { kind: 'hint', decision: Strategy.decide(game.activeHand.cards, game.dealerUp, game.strategyContext()) };
    } else return;
    render();
  }

  function record(id, ok) {
    Stats.record(id, ok);
    session.n++;
    if (ok) session.c++;
  }

  function recordInsurance(ok) {
    Stats.recordInsurance(ok);
    session.n++;
    if (ok) session.c++;
  }

  function afterChange() {
    if (game.phase === 'done') {
      session.rounds++;
      session.net += game.net;
    }
    save();
    render();
  }

  function resetBankroll() {
    if (game.inRound) return;
    game.bankroll = START_BANKROLL;
    bet = Math.min(Math.max(bet, 10), START_BANKROLL);
    session.net = 0;
    session.rounds = 0;
    save();
    note('Bankroll reset to ' + money(START_BANKROLL) + '.');
  }

  function note(text) {
    feedback = { kind: 'info', text };
    render();
  }

  // ---------------------------------------------------------------------------
  function render() {
    const s = Settings.data;
    ui.playBankroll.textContent = money(game.bankroll);
    ui.playBet.textContent = money(game.inRound ? game.hands.reduce((a, h) => a + h.bet, 0) : bet);
    const size = game.shoe.size;
    ui.playDeck.textContent = `${game.shoe.remaining} / ${size}`;
    ui.playDeckBar.style.width = (game.shoe.remaining / size) * 100 + '%';
    ui.playDeckCut.style.left = (game.shoe.cutCard(game.rules.penetration) / size) * 100 + '%';
    document.querySelectorAll('#tab-play [data-chip]').forEach((b) => (b.disabled = game.inRound));

    // Animate new cards in the order they came out of the shoe (you, dealer, you, dealer...).
    // The hole card turns over after your last card; the dealer's own draws come slower.
    const hide = !game.holeRevealed && game.dealer.length > 1 ? 1 : null;
    const fresh = [];
    for (const h of game.hands) for (const c of h.cards) if (BJ.UI.isFresh(c, false)) fresh.push({ c, key: c.seq || 0, dealer: false });
    game.dealer.forEach((c, i) => BJ.UI.isFresh(c, i === hide) && fresh.push({ c, key: c.seq || 0, dealer: true }));
    const lastPlayer = Math.max(0, ...fresh.filter((f) => !f.dealer).map((f) => f.key));
    for (const f of fresh) if (f.c === game.dealer[1] && hide == null && f.key < lastPlayer) f.key = lastPlayer + 0.5;
    fresh.sort((a, b) => a.key - b.key);
    const delays = new Map();
    let t = 0;
    fresh.forEach((f, i) => {
      const dealerTurn = f.dealer && game.phase === 'done' && game.dealer.indexOf(f.c) >= 1;
      if (i > 0) t += dealerTurn ? 0.45 : 0.2;
      delays.set(f.c, t);
    });
    const delayOf = (c) => delays.get(c);

    fill(ui.playHands);
    const handEls = game.hands.map((h, i) => {
      const cards = el('div', { class: 'cards' });
      const he = el('div', { class: 'hand' + (game.phase === 'player' && i === game.active ? ' active' : '') + (h.result ? ' r-' + h.result : '') }, cards);
      ui.playHands.append(he);
      renderCards(cards, h.cards, { delayOf });
      return { he, h };
    });
    renderCards(ui.playDealer, game.dealer, { hideIndex: hide, delayOf });
    const revealAt = game.phase === 'done' && fresh.length ? t + 0.3 : 0;
    let dealerText = '';
    if (game.dealer.length && s.showTotals) dealerText = hide != null ? `showing ${Strategy.UP_LABELS[Strategy.colOf(game.dealerUp)]}` : totalLabel(game.dealer);
    fill(ui.playDealerTotal, revealAt ? el('span', { class: 'fade-in', style: `animation-delay:${revealAt}s` }, dealerText) : dealerText);

    for (const { he, h } of handEls) {
      const meta = el(
        'div',
        { class: 'hand-meta' },
        s.showTotals ? el('span', { class: 'total' }, totalLabel(h.cards, { noBlackjack: h.fromSplit })) : null,
        el('span', { class: 'bet-tag' }, money(h.bet) + (h.doubled ? ' · doubled' : ''))
      );
      if (h.result) meta.append(el('span', { class: 'badge fade-in b-' + h.result, style: `animation-delay:${revealAt}s` }, RESULT_LABEL[h.result]));
      he.append(meta);
    }

    renderMessage(revealAt);
    renderControls();
    renderCoach();
    renderVerdict();
  }

  /** One-line version of the coach's feedback, shown on the table (the coach panel is below it on phones). */
  function renderVerdict() {
    const f = feedback;
    let text = null;
    let cls = '';
    if (f && f.insurance) {
      const what = f.evenMoney ? 'even money' : 'insurance';
      if (f.kind === 'hint') [text, cls] = [`Hint: decline ${what}`, 'hint'];
      else if (f.kind === 'ok') [text, cls] = [`✓ No ${what}`, 'ok'];
      else [text, cls] = [f.strict ? `✗ Try again: decline ${what}` : `✗ Never take ${what}`, 'bad'];
    } else if (f && f.decision) {
      const a = f.decision.actionName;
      if (f.kind === 'hint') [text, cls] = [`Hint: ${a}`, 'hint'];
      else if (f.kind === 'ok') [text, cls] = [`✓ ${a}`, 'ok'];
      else [text, cls] = [f.strict ? `✗ Try again: ${a}` : `✗ Basic strategy: ${a}`, 'bad'];
    }
    ui.playVerdict.className = 'verdict' + (text ? ` show ${cls}` : '');
    fill(ui.playVerdict, text);
  }

  function renderMessage(delay) {
    fill(ui.playMsg);
    ui.playMsg.className = 'round-msg';
    if (game.phase === 'insurance') {
      ui.playMsg.append(el('span', null, Cards.isBlackjack(game.hands[0].cards) ? 'Dealer shows an Ace. Take even money?' : 'Dealer shows an Ace. Insurance?'));
      return;
    }
    if (game.phase === 'idle') {
      ui.playMsg.append(el('span', { class: 'muted' }, 'Pick a bet and press Deal (Space).'));
      return;
    }
    if (game.phase !== 'done') return;
    const n = game.net;
    const d = Cards.handTotal(game.dealer).total;
    let sub = game.dealerBlackjack ? 'Dealer has blackjack' : d > 21 ? `Dealer busts with ${d}` : `Dealer has ${d}`;
    if (game.hands.length === 1 && game.hands[0].result === 'blackjack') sub = `Blackjack pays ${game.rules.bjPayout === 1.5 ? '3:2' : '6:5'}`;
    if (game.hands.length === 1 && game.hands[0].result === 'bust') sub = 'You busted';
    if (game.hands.length === 1 && game.hands[0].result === 'surrender') sub = 'Half your bet back';
    if (game.insuranceResult) sub += game.insuranceResult === 'won' ? ' · insurance paid 2:1' : ' · insurance lost';
    ui.playMsg.append(
      el(
        'div',
        { class: `msg-result fade-in ${n > 0 ? 'win' : n < 0 ? 'lose' : 'push'}`, style: `animation-delay:${delay}s` },
        el('strong', null, n > 0 ? `You win ${money(n)}` : n < 0 ? `You lose ${money(-n)}` : 'Push'),
        el('span', null, sub)
      )
    );
  }

  function renderControls() {
    const phase = game.phase;
    ui.playBetting.hidden = game.inRound;
    ui.playInsurance.hidden = phase !== 'insurance';
    ui.playMoves.hidden = phase !== 'player';
    ui.playDeal.disabled = bet < MIN_BET || game.bankroll < MIN_BET;
    ui.playDeal.textContent = game.bankroll < MIN_BET ? 'Out of money' : `Deal ${money(Math.min(bet, game.bankroll))}`;
    if (phase === 'insurance') {
      const em = Cards.isBlackjack(game.hands[0].cards);
      ui.playInsText.textContent = em ? 'Even money?' : 'Insurance?';
      ui.playInsYes.disabled = !game.canAffordInsurance();
    }
    const a = game.available();
    document.querySelectorAll('#playMoves [data-action]').forEach((b) => (b.disabled = !a[b.dataset.action]));
  }

  function feedbackView() {
    const f = feedback;
    if (!f) {
      if (game.inRound) return el('p', { class: 'muted' }, 'Make your move. The coach checks it against the chart.');
      return el('p', { class: 'muted' }, 'Every decision you make is checked against your chart and logged to Progress.');
    }
    if (f.kind === 'info') return el('p', { class: 'coach-info' }, f.text);

    if (f.insurance) {
      const what = f.evenMoney ? 'even money' : 'insurance';
      const why = 'Insurance is a side bet that the dealer has blackjack. It loses money in the long run, so basic strategy never takes it (even money is the same bet).';
      if (f.kind === 'hint') return el('div', { class: 'fb hint' }, el('div', { class: 'fb-head' }, `Hint: decline ${what}.`), el('p', { class: 'small' }, why));
      if (f.kind === 'ok') return el('div', { class: 'fb ok' }, el('div', { class: 'fb-head' }, `✓ Right: no ${what}.`), f.retried ? el('p', { class: 'small muted' }, 'Counted as a miss, since the first try was wrong.') : null);
      return el('div', { class: 'fb bad' }, el('div', { class: 'fb-head' }, f.strict ? `✗ Not quite. Decline ${what}.` : `✗ Don’t take ${what}.`), el('p', { class: 'small' }, why));
    }

    const d = f.decision;
    const where = `${d.handName} vs dealer ${d.upLabel}${f.handNo ? ` (hand ${f.handNo})` : ''}`;
    if (f.kind === 'hint') return el('div', { class: 'fb hint' }, el('div', { class: 'fb-head' }, 'Hint: ', el('b', null, d.actionName)), el('p', { class: 'fb-sub' }, where), traceView(d), el('p', { class: 'small muted' }, 'This decision won’t be scored.'));
    if (f.kind === 'ok')
      return el(
        'div',
        { class: 'fb ok' },
        el('div', { class: 'fb-head' }, '✓ Right: ', el('b', null, d.actionName)),
        el('p', { class: 'fb-sub' }, where),
        f.retried ? el('p', { class: 'small muted' }, 'Counted as a miss, since the first try was wrong.') : null,
        f.hinted ? el('p', { class: 'small muted' }, 'Not scored (you used the hint).') : null,
        el('details', null, el('summary', null, 'Why?'), traceView(d))
      );
    return el(
      'div',
      { class: 'fb bad' },
      el('div', { class: 'fb-head' }, f.strict ? '✗ Not quite. Try again: ' : `✗ You chose ${Strategy.ACTION_NAMES[f.chosen]}. Basic strategy says `, el('b', null, d.actionName)),
      el('p', { class: 'fb-sub' }, where),
      traceView(d)
    );
  }

  function renderCoach() {
    const item = (label, value) => el('div', { class: 'stat' }, el('span', null, label), el('strong', null, value));
    fill(ui.playCoach, 
      el('div', { class: 'coach-head' }, el('h2', null, 'Coach'), el('button', { class: 'btn small', onclick: hint, disabled: !game.inRound }, 'Hint ', el('kbd', null, '?'))),
      el('div', { class: 'coach-feedback', 'aria-live': 'polite' }, feedbackView()),
      el(
        'div',
        { class: 'stat-row compact' },
        item('Decisions', session.n),
        item('Accuracy', session.n ? pct(session.c / session.n) : '–'),
        item('Rounds', session.rounds),
        item('Session', money(session.net))
      ),
      el('p', { class: 'muted small' }, rulesSummary(true)),
      game.inRound && JSON.stringify(rules()) !== JSON.stringify(pickRules(game.rules)) ? el('p', { class: 'small warn' }, 'Rule changes apply from the next hand.') : null,
      el('p', { class: 'muted small' }, strict() ? 'Strict mode: a wrong move is blocked until you play the right one.' : 'Coach mode: you can make mistakes. They’re flagged and logged.'),
      el('p', { class: 'muted small keys' }, el('kbd', null, 'H'), ' hit ', el('kbd', null, 'S'), ' stand ', el('kbd', null, 'D'), ' double ', el('kbd', null, 'P'), ' split ', el('kbd', null, 'R'), ' surrender ', el('kbd', null, 'Space'), ' deal ', el('kbd', null, 'I'), '/', el('kbd', null, 'N'), ' insurance')
    );
  }

  function pickRules(r) {
    return { h17: r.h17, das: r.das, surrender: r.surrender, doubleRule: r.doubleRule, bjPayout: r.bjPayout };
  }

  const KEYS = { h: 'H', s: 'S', d: 'D', p: 'P', r: 'R' };
  function onKey(e) {
    const k = e.key.toLowerCase();
    if (KEYS[k]) {
      act(KEYS[k]);
      return true;
    }
    if (k === ' ' || k === 'enter') {
      if (!game.inRound) deal();
      return true;
    }
    if (k === 'i' || k === 'y') {
      insurance(true);
      return true;
    }
    if (k === 'n') {
      insurance(false);
      return true;
    }
    if (e.key === '?') {
      hint();
      return true;
    }
    return false;
  }

  BJ.Tabs = BJ.Tabs || {};
  BJ.Tabs.play = { init, onKey };
})(window);
