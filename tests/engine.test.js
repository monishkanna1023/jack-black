// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');

require('../public/js/cards.js');
require('../public/js/strategy.js');
require('../public/js/game.js');
const { Cards, Strategy, Game } = globalThis.BJ;

const hand = (...ranks) => ranks.map((r, i) => ({ rank: String(r), suit: Cards.SUITS[i % 4] }));
const two = { canSplit: true, canDouble: true, canSurrender: true, das: true };
const act = (ranks, up, ctx) => Strategy.decide(hand(...ranks), up, Object.assign({}, two, ctx)).action;

// ---------------------------------------------------------------------------
// Spot checks typed independently from the chart image (catches transcription errors).
// ---------------------------------------------------------------------------
test('chart spot checks: pairs', () => {
  assert.equal(act(['A', 'A'], 'A'), 'P');
  assert.equal(act(['K', 'Q'], '6'), 'S'); // T,T never split
  assert.equal(act(['9', '9'], '7'), 'S');
  assert.equal(act(['9', '9'], '8'), 'P');
  assert.equal(act(['9', '9'], '10'), 'S');
  assert.equal(act(['9', '9'], 'A'), 'S');
  assert.equal(act(['8', '8'], 'A'), 'P');
  assert.equal(act(['8', '8'], '10'), 'P'); // split beats surrender
  assert.equal(act(['7', '7'], '7'), 'P');
  assert.equal(act(['7', '7'], '8'), 'H');
  assert.equal(act(['7', '7'], '10'), 'H'); // 14 row of surrender table is blank
  assert.equal(act(['6', '6'], '2'), 'P');
  assert.equal(act(['6', '6'], '2', { das: false }), 'H'); // hard 12 vs 2
  assert.equal(act(['6', '6'], '7'), 'H');
  assert.equal(act(['5', '5'], '9'), 'D'); // hard 10
  assert.equal(act(['5', '5'], '10'), 'H');
  assert.equal(act(['4', '4'], '5'), 'P');
  assert.equal(act(['4', '4'], '5', { das: false }), 'H');
  assert.equal(act(['4', '4'], '4'), 'H');
  assert.equal(act(['3', '3'], '3'), 'P');
  assert.equal(act(['3', '3'], '3', { das: false }), 'H');
  assert.equal(act(['3', '3'], '7'), 'P');
  assert.equal(act(['2', '2'], '8'), 'H');
});

test('chart spot checks: soft totals', () => {
  assert.equal(act(['A', '9'], '6'), 'S');
  assert.equal(act(['A', '8'], '6'), 'D');
  assert.equal(act(['A', '8'], '6', { canDouble: false }), 'S'); // Ds
  assert.equal(act(['A', '8'], '5'), 'S');
  assert.equal(act(['A', '7'], '2'), 'D');
  assert.equal(act(['A', '7'], '2', { canDouble: false }), 'S');
  assert.equal(act(['A', '7'], '8'), 'S');
  assert.equal(act(['A', '7'], '9'), 'H');
  assert.equal(act(['A', '7'], 'A'), 'H');
  assert.equal(act(['A', '6'], '2'), 'H');
  assert.equal(act(['A', '6'], '3'), 'D');
  assert.equal(act(['A', '6'], '3', { canDouble: false }), 'H'); // D
  assert.equal(act(['A', '5'], '3'), 'H');
  assert.equal(act(['A', '4'], '4'), 'D');
  assert.equal(act(['A', '3'], '4'), 'H');
  assert.equal(act(['A', '2'], '5'), 'D');
  assert.equal(act(['A', '2'], '7'), 'H');
  // 3-card soft hands can't double
  assert.equal(act(['A', '2', '5'], '4', { canDouble: false }), 'S'); // soft 18 vs 4, Ds -> stand
  assert.equal(act(['A', '3', '2'], '4', { canDouble: false }), 'H'); // soft 17 vs 4, D -> hit
});

test('chart spot checks: hard totals and surrender', () => {
  assert.equal(act(['10', '7'], 'A'), 'S');
  assert.equal(act(['10', '6'], '6'), 'S');
  assert.equal(act(['10', '6'], '7'), 'H');
  assert.equal(act(['10', '6'], '10'), 'R');
  assert.equal(act(['10', '6'], '10', { canSurrender: false }), 'H');
  assert.equal(act(['9', '7'], '9'), 'R');
  assert.equal(act(['9', '7'], 'A'), 'R');
  assert.equal(act(['9', '7'], '8'), 'H');
  assert.equal(act(['10', '5'], '10'), 'R');
  assert.equal(act(['10', '5'], '9'), 'H');
  assert.equal(act(['10', '5'], 'A'), 'H');
  assert.equal(act(['10', '4'], '10'), 'H');
  assert.equal(act(['10', '3'], '2'), 'S');
  assert.equal(act(['10', '2'], '3'), 'H');
  assert.equal(act(['10', '2'], '4'), 'S');
  assert.equal(act(['10', '2'], '7'), 'H');
  assert.equal(act(['6', '5'], 'A'), 'D');
  assert.equal(act(['6', '4'], '9'), 'D');
  assert.equal(act(['6', '4'], '10'), 'H');
  assert.equal(act(['5', '4'], '2'), 'H');
  assert.equal(act(['5', '4'], '3'), 'D');
  assert.equal(act(['5', '4'], '7'), 'H');
  assert.equal(act(['5', '3'], '6'), 'H');
  assert.equal(act(['3', '2'], '6'), 'H');
  assert.equal(act(['6', '5'], '5', { canDouble: false }), 'H');
  assert.equal(act(['5', '4', '7'], '10', { canSurrender: false, canDouble: false }), 'H'); // 3-card 16
  assert.equal(act(['A', 'A'], '6', { canSplit: false }), 'H'); // soft 12
});

// ---------------------------------------------------------------------------
// Every cell, every rule combination, via the cell-driven engine.
// ---------------------------------------------------------------------------
test('every chart cell resolves to the action its code implies', () => {
  for (const das of [true, false]) {
    for (const canSurrender of [true, false]) {
      for (const canDouble of [true, false]) {
        for (const cell of Strategy.allCells()) {
          const { player, dealer } = Strategy.makeDeal(cell.table, cell.rowKey, cell.col, 2);
          const ctx = { canSplit: true, canDouble, canSurrender, das };
          const d = Strategy.decide(player, dealer, ctx);
          const code = Strategy.lookup(cell.table, cell.rowKey, cell.col);
          const t = Cards.handTotal(player);
          let expected;
          if (cell.table === 'pairs') {
            if (code === 'Y' || (code === 'Y/N' && das)) expected = 'P';
            else expected = Strategy.decide(player, dealer, Object.assign({}, ctx, { canSplit: false })).action;
          } else {
            const sur = !t.soft && (t.total === 15 || t.total === 16) && Strategy.lookup('surrender', t.total, cell.col) === 'SUR';
            if (sur && canSurrender) expected = 'R';
            else if (code === 'D') expected = canDouble ? 'D' : 'H';
            else if (code === 'Ds') expected = canDouble ? 'D' : 'S';
            else expected = code;
          }
          assert.equal(d.action, expected, `${cell.id} das=${das} sur=${canSurrender} dbl=${canDouble}`);
          assert.equal(d.cellId, cell.id, `cellId for ${cell.id}`);
        }
      }
    }
  }
});

test('makeDeal builds hands that land in the requested cell (2 and 3 cards)', () => {
  for (let i = 0; i < 20; i++) {
    for (const cell of Strategy.allCells()) {
      for (const n of [2, 3]) {
        const { player, dealer } = Strategy.makeDeal(cell.table, cell.rowKey, cell.col, n);
        const id = Strategy.cellIdFor(player, Strategy.colOf(dealer), cell.table === 'pairs');
        assert.equal(id, cell.id, `${cell.id} n=${n}: ${player.map((c) => c.rank).join(',')}`);
        const keys = [...player, dealer].map((c) => c.rank + c.suit);
        assert.equal(new Set(keys).size, keys.length, 'no duplicate physical cards');
      }
    }
  }
});

test('table shapes match the image', () => {
  assert.equal(Strategy.TABLES.pairs.rows.length, 10);
  assert.equal(Strategy.TABLES.soft.rows.length, 8);
  assert.equal(Strategy.TABLES.hard.rows.length, 10);
  assert.equal(Strategy.TABLES.surrender.rows.length, 3);
  for (const t of Strategy.TABLE_ORDER) {
    for (const r of Strategy.TABLES[t].rows) {
      assert.equal(r.cells.length, 10, `${t} ${r.label}`);
      for (const c of r.cells) assert.ok(Strategy.TABLES[t].codes.includes(c), `${t} ${r.label}: ${c}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Game engine with a rigged deck. Deal order: player, dealer up, player, dealer hole, then hits.
// ---------------------------------------------------------------------------
function rigged(ranks, rules, bankroll) {
  const shoe = new Cards.Shoe(1);
  const seq = ranks.map((r, i) => Cards.makeCard(String(r), Cards.SUITS[i % 4]));
  shoe.cards = seq.slice().reverse(); // draw() pops from the end
  shoe.needsShuffle = () => false;
  return new Game(Object.assign({ h17: true, das: true, surrender: true }, rules), { shoe, bankroll: bankroll || 1000 });
}

test('shoe: 52 unique cards, reshuffle threshold', () => {
  const shoe = new Cards.Shoe(1);
  assert.equal(shoe.remaining, 52);
  assert.equal(new Set(shoe.cards.map((c) => c.rank + c.suit)).size, 52);
  for (let i = 0; i < 34; i++) shoe.draw();
  assert.equal(shoe.needsShuffle(0.65), false); // 18 left
  shoe.draw();
  assert.equal(shoe.needsShuffle(0.65), true); // 17 left
});

test('blackjack pays 3:2 (and 6:5)', () => {
  let g = rigged(['A', '9', 'K', '7']);
  g.deal(10);
  assert.equal(g.phase, 'done');
  assert.equal(g.hands[0].result, 'blackjack');
  assert.equal(g.bankroll, 1015);
  g = rigged(['A', '9', 'K', '7'], { bjPayout: 1.2 });
  g.deal(10);
  assert.equal(g.bankroll, 1012);
});

test('dealer blackjack with 10 up ends the round; insurance pays 2:1', () => {
  let g = rigged(['10', 'K', '9', 'A']);
  g.deal(10);
  assert.equal(g.phase, 'done');
  assert.equal(g.hands[0].result, 'lose');
  assert.equal(g.bankroll, 990);

  g = rigged(['10', 'A', '9', 'K']);
  g.deal(10);
  assert.equal(g.phase, 'insurance');
  g.insurance(true);
  assert.equal(g.insuranceResult, 'won');
  assert.equal(g.bankroll, 1000); // lose 10, insurance +10

  g = rigged(['10', 'A', '9', '6', '2', 'K']);
  g.deal(10);
  g.insurance(true);
  assert.equal(g.insuranceResult, 'lost');
  assert.equal(g.phase, 'player');
  assert.equal(g.bankroll, 985);
});

test('dealer hits soft 17 under H17, stands under S17', () => {
  let g = rigged(['10', '6', '8', 'A', '3']);
  g.deal(10);
  g.act('S');
  assert.equal(g.dealer.length, 3); // A,6 -> hit -> 20
  assert.equal(g.hands[0].result, 'lose');
  g = rigged(['10', '6', '8', 'A', '3'], { h17: false });
  g.deal(10);
  g.act('S');
  assert.equal(g.dealer.length, 2);
  assert.equal(g.hands[0].result, 'win');
  assert.equal(g.bankroll, 1010);
});

test('double: one card, bet doubled', () => {
  const g = rigged(['6', '6', '5', '10', '10', '9']);
  g.deal(10);
  assert.equal(g.available().D, true);
  g.act('D');
  assert.equal(g.hands[0].cards.length, 3);
  assert.equal(g.hands[0].bet, 20);
  // dealer 6,10 = 16 -> draws 9 -> bust
  assert.equal(g.hands[0].result, 'win');
  assert.equal(g.bankroll, 1020);
});

test('split 8s: second hand gets its card when reached; DAS controls doubling', () => {
  const g = rigged(['8', '6', '8', '10', '3', '2', '10', '9']);
  g.deal(10);
  assert.equal(g.available().P, true);
  assert.equal(g.available().R, true);
  g.act('P');
  assert.equal(g.hands.length, 2);
  assert.deepEqual(g.hands[0].cards.map((c) => c.rank), ['8', '3']);
  assert.equal(g.hands[1].cards.length, 1);
  assert.equal(g.available().R, false); // no surrender after split
  assert.equal(g.available().D, true); // DAS
  g.act('D'); // 8,3 + 2 = 13
  assert.equal(g.active, 1);
  assert.deepEqual(g.hands[1].cards.map((c) => c.rank), ['8', '10']);
  g.act('S'); // dealer 6,10 + 9 = 25 bust
  assert.equal(g.phase, 'done');
  assert.deepEqual(g.hands.map((h) => h.result), ['win', 'win']);
  assert.equal(g.bankroll, 1030);

  const noDas = rigged(['8', '6', '8', '10', '3', '2'], { das: false });
  noDas.deal(10);
  noDas.act('P');
  assert.equal(noDas.available().D, false);
});

test('split aces get one card each and auto-stand', () => {
  const g = rigged(['A', '6', 'A', '10', 'K', 'A', '9']);
  g.deal(10);
  g.act('P');
  assert.equal(g.phase, 'done');
  assert.deepEqual(g.hands.map((h) => h.cards.length), [2, 2]);
  assert.equal(g.hands[0].result, 'win'); // A,K = 21 (not blackjack) vs dealer 6,10,9 bust
  assert.equal(g.hands[1].result, 'win'); // A,A soft 12, can't resplit
});

test('surrender returns half; all-bust hands mean dealer does not draw', () => {
  let g = rigged(['10', '10', '6', '5']);
  g.deal(10);
  g.act('R');
  assert.equal(g.hands[0].result, 'surrender');
  assert.equal(g.bankroll, 995);

  g = rigged(['10', '7', '6', '5', 'K']);
  g.deal(10);
  g.act('H');
  assert.equal(g.hands[0].result, 'bust');
  assert.equal(g.dealer.length, 2);
});

test('doubling restrictions', () => {
  const g = rigged(['5', '7', '4', '10'], { doubleRule: '10-11' });
  g.deal(10);
  assert.equal(g.available().D, false); // hard 9
  const g2 = rigged(['6', '7', '4', '10'], { doubleRule: '10-11' });
  g2.deal(10);
  assert.equal(g2.available().D, true); // hard 10
  const g3 = rigged(['6', '7', '4', '10', '2'], {});
  g3.deal(10);
  g3.act('H');
  assert.equal(g3.available().D, false); // 3 cards
  assert.equal(g3.available().R, false);
});

test('a full random session never throws and money is conserved per round', () => {
  for (let s = 0; s < 3; s++) {
    const g = new Game({}, { bankroll: 1e9 });
    for (let i = 0; i < 3000; i++) {
      const before = g.bankroll;
      g.deal(10);
      if (g.phase === 'insurance') g.insurance(false);
      while (g.phase === 'player') {
        const d = Strategy.decide(g.activeHand.cards, g.dealerUp, g.strategyContext());
        g.act(d.action);
      }
      assert.equal(g.phase, 'done');
      assert.equal(g.net, g.bankroll - before);
      for (const h of g.hands) assert.ok(h.result, 'every hand settled');
    }
  }
});
