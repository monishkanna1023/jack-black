/* The basic strategy chart (transcribed from BJA_Basic_Strategy.jpg) and the decision engine.
   No DOM — also loadable from Node for tests. */
(function (global) {
  'use strict';
  const BJ = global.BJ || (global.BJ = {});
  const Cards = BJ.Cards;

  const UPCARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // 11 = Ace
  const UP_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
  const TABLE_ORDER = ['pairs', 'soft', 'hard', 'surrender'];

  const row = (key, label, name, cells) => ({ key, label, name, cells: cells.trim().split(/\s+/) });

  // ---------------------------------------------------------------------------
  // The chart, cell for cell. Columns = dealer upcard:
  //                                              2   3   4   5   6   7   8   9   10  A
  // ---------------------------------------------------------------------------
  const TABLES = {
    pairs: {
      title: 'Pair Splitting',
      codes: ['Y', 'Y/N', 'N'],
      rows: [
        row(11, 'A,A', 'Pair of Aces', '      Y   Y   Y   Y   Y   Y   Y   Y   Y   Y'),
        row(10, 'T,T', 'Pair of 10s', '       N   N   N   N   N   N   N   N   N   N'),
        row(9, '9,9', 'Pair of 9s', '         Y   Y   Y   Y   Y   N   Y   Y   N   N'),
        row(8, '8,8', 'Pair of 8s', '         Y   Y   Y   Y   Y   Y   Y   Y   Y   Y'),
        row(7, '7,7', 'Pair of 7s', '         Y   Y   Y   Y   Y   Y   N   N   N   N'),
        row(6, '6,6', 'Pair of 6s', '         Y/N Y   Y   Y   Y   N   N   N   N   N'),
        row(5, '5,5', 'Pair of 5s', '         N   N   N   N   N   N   N   N   N   N'),
        row(4, '4,4', 'Pair of 4s', '         N   N   N   Y/N Y/N N   N   N   N   N'),
        row(3, '3,3', 'Pair of 3s', '         Y/N Y/N Y   Y   Y   Y   N   N   N   N'),
        row(2, '2,2', 'Pair of 2s', '         Y/N Y/N Y   Y   Y   Y   N   N   N   N'),
      ],
    },
    soft: {
      title: 'Soft Totals',
      codes: ['H', 'S', 'D', 'Ds'],
      rows: [
        row(20, 'A,9', 'Soft 20 (A,9)', '     S   S   S   S   S   S   S   S   S   S'),
        row(19, 'A,8', 'Soft 19 (A,8)', '     S   S   S   S   Ds  S   S   S   S   S'),
        row(18, 'A,7', 'Soft 18 (A,7)', '     Ds  Ds  Ds  Ds  Ds  S   S   H   H   H'),
        row(17, 'A,6', 'Soft 17 (A,6)', '     H   D   D   D   D   H   H   H   H   H'),
        row(16, 'A,5', 'Soft 16 (A,5)', '     H   H   D   D   D   H   H   H   H   H'),
        row(15, 'A,4', 'Soft 15 (A,4)', '     H   H   D   D   D   H   H   H   H   H'),
        row(14, 'A,3', 'Soft 14 (A,3)', '     H   H   H   D   D   H   H   H   H   H'),
        row(13, 'A,2', 'Soft 13 (A,2)', '     H   H   H   D   D   H   H   H   H   H'),
      ],
    },
    hard: {
      title: 'Hard Totals',
      codes: ['H', 'S', 'D'],
      rows: [
        row(17, '17', 'Hard 17 or more', '   S   S   S   S   S   S   S   S   S   S'),
        row(16, '16', 'Hard 16', '           S   S   S   S   S   H   H   H   H   H'),
        row(15, '15', 'Hard 15', '           S   S   S   S   S   H   H   H   H   H'),
        row(14, '14', 'Hard 14', '           S   S   S   S   S   H   H   H   H   H'),
        row(13, '13', 'Hard 13', '           S   S   S   S   S   H   H   H   H   H'),
        row(12, '12', 'Hard 12', '           H   H   S   S   S   H   H   H   H   H'),
        row(11, '11', 'Hard 11', '           D   D   D   D   D   D   D   D   D   D'),
        row(10, '10', 'Hard 10', '           D   D   D   D   D   D   D   D   H   H'),
        row(9, '9', 'Hard 9', '              H   D   D   D   D   H   H   H   H   H'),
        row(8, '8', 'Hard 8 or less', '      H   H   H   H   H   H   H   H   H   H'),
      ],
    },
    surrender: {
      title: 'Late Surrender',
      codes: ['SUR', '-'],
      rows: [
        row(16, '16', 'Hard 16', '           -   -   -   -   -   -   -   SUR SUR SUR'),
        row(15, '15', 'Hard 15', '           -   -   -   -   -   -   -   -   SUR -'),
        row(14, '14', 'Hard 14', '           -   -   -   -   -   -   -   -   -   -'),
      ],
    },
  };

  const CODE_INFO = {
    Y: { short: 'Split', long: 'Split the pair' },
    'Y/N': { short: 'Split if DAS', long: 'Split if Double After Split (DAS) is offered, otherwise do not split' },
    N: { short: "Don't split", long: "Don't split the pair" },
    H: { short: 'Hit', long: 'Hit' },
    S: { short: 'Stand', long: 'Stand' },
    D: { short: 'Double', long: 'Double if allowed, otherwise hit' },
    Ds: { short: 'Double / stand', long: 'Double if allowed, otherwise stand' },
    SUR: { short: 'Surrender', long: 'Surrender' },
    '-': { short: 'No surrender', long: "Don't surrender, play the hand from the other tables" },
  };

  const LEGEND = {
    pairs: ['Y', 'Y/N', 'N'],
    soft: ['H', 'S', 'D', 'Ds'],
    hard: ['H', 'S', 'D'],
    surrender: ['SUR'],
  };

  const ACTION_NAMES = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };

  // Rules of thumb, derived from the chart above, to help memorise each row.
  const ROW_TIPS = {
    'pairs:11': 'Always split Aces.',
    'pairs:10': 'Never split 10s. A hard 20 is already a great hand.',
    'pairs:9': 'Split vs 2–9 except 7. Stand vs 7, 10 and A.',
    'pairs:8': 'Always split 8s. Hard 16 is the worst total you can hold.',
    'pairs:7': 'Split vs 2–7. Otherwise play it as hard 14.',
    'pairs:6': 'Split vs 3–6 (vs 2 too, if DAS). Otherwise play it as hard 12.',
    'pairs:5': 'Never split 5s. Play them as hard 10 (double vs 2–9).',
    'pairs:4': 'Split only vs 5–6, and only with DAS. Otherwise play it as hard 8 (hit).',
    'pairs:3': 'Split vs 4–7 (vs 2–3 too, if DAS). Otherwise hit.',
    'pairs:2': 'Split vs 4–7 (vs 2–3 too, if DAS). Otherwise hit.',
    'soft:20': 'Soft 20 always stands.',
    'soft:19': 'Stand, except double vs 6 (stand if you can’t double).',
    'soft:18': 'Double vs 2–6 (stand if you can’t). Stand vs 7–8. Hit vs 9, 10, A.',
    'soft:17': 'Double vs 3–6, otherwise hit. Never stand on soft 17.',
    'soft:16': 'Double vs 4–6, otherwise hit.',
    'soft:15': 'Double vs 4–6, otherwise hit.',
    'soft:14': 'Double vs 5–6, otherwise hit.',
    'soft:13': 'Double vs 5–6, otherwise hit.',
    'hard:17': '17 or more: always stand.',
    'hard:16': 'Stand vs 2–6, hit vs 7–A. (Surrender vs 9, 10, A when it’s offered.)',
    'hard:15': 'Stand vs 2–6, hit vs 7–A. (Surrender vs 10 when it’s offered.)',
    'hard:14': 'Stand vs 2–6, hit vs 7–A.',
    'hard:13': 'Stand vs 2–6, hit vs 7–A.',
    'hard:12': 'Stand only vs 4–6. Hit vs 2, 3 and 7–A.',
    'hard:11': 'Always double (hit if you can’t).',
    'hard:10': 'Double vs 2–9. Hit vs 10 and A.',
    'hard:9': 'Double vs 3–6, otherwise hit.',
    'hard:8': '8 or less: always hit.',
    'surrender:16': 'Surrender vs 9, 10, A. Not 8,8, which you always split.',
    'surrender:15': 'Surrender vs 10 only.',
    'surrender:14': 'Never surrender 14.',
  };

  const MEMORY_AIDS = {
    pairs: [
      'Always split A,A and 8,8. Never split T,T or 5,5.',
      '9,9: split vs 2–9 except 7. Stand vs 7, 10, A.',
      '7,7 splits vs 2–7. 2,2 and 3,3 split vs 4–7 (2–7 with DAS).',
      '6,6 splits vs 3–6 (2–6 with DAS). 4,4 splits vs 5–6 only with DAS.',
    ],
    soft: [
      'The doubling window widens as the soft total grows: A,2–A,3 vs 5–6 · A,4–A,5 vs 4–6 · A,6 vs 3–6 · A,7 vs 2–6.',
      'A,7 (soft 18): stand vs 7–8, hit vs 9–A.',
      'A,8 doubles only vs 6. A,9 always stands.',
    ],
    hard: [
      '17+: stand. 13–16: stand vs 2–6, hit vs 7–A.',
      '12: stand vs 4–6 only.',
      '11: always double. 10: double vs 2–9. 9: double vs 3–6.',
      '8 or less: hit.',
    ],
    surrender: ['Surrender 16 vs 9, 10, A and 15 vs 10. Only as your very first decision.'],
  };

  function getRow(table, key) {
    return TABLES[table].rows.find((r) => r.key === key) || null;
  }

  function lookup(table, key, col) {
    const r = getRow(table, key);
    if (!r) throw new Error(`No row ${key} in ${table}`);
    return r.cells[col];
  }

  function toUpValue(up) {
    if (typeof up === 'number') return up;
    if (typeof up === 'string') return Cards.value(up);
    return Cards.value(up.rank);
  }

  function colOf(up) {
    const col = UPCARDS.indexOf(toUpValue(up));
    if (col < 0) throw new Error('Bad dealer upcard: ' + JSON.stringify(up));
    return col;
  }

  /** Doubling restriction some single-deck games use. Applies to the first two cards only. */
  function canDoubleByRule(total, soft, rule) {
    if (rule === '9-11') return !soft && total >= 9 && total <= 11;
    if (rule === '10-11') return !soft && (total === 10 || total === 11);
    return true;
  }

  function describeHand(cards) {
    const { total, soft } = Cards.handTotal(cards);
    if (Cards.isPair(cards)) {
      const v = Cards.value(cards[0].rank);
      return v === 11 ? 'Pair of Aces' : `Pair of ${v}s`;
    }
    if (cards.length === 2 && total === 21) return 'Blackjack';
    if (cards.length === 2 && soft) return `Soft ${total} (A,${total - 11})`;
    if (soft) return `Soft ${total}`;
    return `Hard ${total}`;
  }

  /** Stats key for a decision: which chart cell the hand lives in, e.g. "soft:18:6". */
  function cellIdFor(cards, col, canSplit) {
    const { total, soft } = Cards.handTotal(cards);
    const up = UP_LABELS[col];
    if (Cards.isPair(cards) && canSplit) return `pairs:${Cards.value(cards[0].rank)}:${up}`;
    if (soft) return total >= 13 && total <= 20 ? `soft:${total}:${up}` : null;
    if (total > 21) return null;
    return `hard:${Math.max(8, Math.min(17, total))}:${up}`;
  }

  function parseCellId(id) {
    const [table, key, up] = id.split(':');
    return { table, rowKey: Number(key), col: UP_LABELS.indexOf(up) };
  }

  function step(table, rowKey, col, code, note) {
    return { table, rowKey, col, code, note };
  }

  /**
   * The basic strategy decision for a hand.
   * ctx: { canSplit, canDouble, canSurrender, das } — what the table allows *for this hand right now*.
   * Returns { action: 'H'|'S'|'D'|'P'|'R', actionName, trace: [chart lookups with notes], handName, cellId, ... }
   */
  function decide(cards, up, ctx) {
    const c = Object.assign({ canSplit: true, canDouble: true, canSurrender: false, das: true }, ctx || {});
    const col = colOf(up);
    const { total, soft } = Cards.handTotal(cards);
    const pair = Cards.isPair(cards);
    const trace = [];
    const done = (action) => ({
      action,
      actionName: ACTION_NAMES[action],
      trace,
      col,
      upLabel: UP_LABELS[col],
      total,
      soft,
      pair,
      handName: describeHand(cards),
      cellId: cellIdFor(cards, col, c.canSplit),
    });

    // 1. Pairs: check the splitting table first.
    if (pair && c.canSplit) {
      const pv = Cards.value(cards[0].rank);
      const code = lookup('pairs', pv, col);
      if (code === 'Y') {
        trace.push(step('pairs', pv, col, code, 'Split the pair.'));
        return done('P');
      }
      if (code === 'Y/N' && c.das) {
        trace.push(step('pairs', pv, col, code, 'Y/N, and DAS is allowed, so split.'));
        return done('P');
      }
      trace.push(
        step('pairs', pv, col, code,
          code === 'Y/N'
            ? 'Y/N, but DAS isn’t allowed, so don’t split. Play it as a regular total.'
            : 'Don’t split. Play it as a regular total.')
      );
    }

    // 2. Late surrender (hard 15 / 16 only; the 14 row is empty).
    if (!soft && (total === 15 || total === 16)) {
      const code = lookup('surrender', total, col);
      if (code === 'SUR') {
        if (c.canSurrender) {
          trace.push(step('surrender', total, col, code, 'Surrender: give up half your bet and end the hand.'));
          return done('R');
        }
        trace.push(
          step('surrender', total, col, code,
            cards.length > 2
              ? 'Surrender is only possible on your first two cards, so use Hard Totals.'
              : 'Surrender isn’t available here, so use Hard Totals.')
        );
      }
    }

    // 3a. Soft totals.
    if (soft && total >= 13 && total <= 20) {
      const code = lookup('soft', total, col);
      let action = code;
      let note = CODE_INFO[code].long + '.';
      if (code === 'D') {
        action = c.canDouble ? 'D' : 'H';
        note = c.canDouble ? 'Double.' : 'Double if allowed, but you can’t double here, so hit.';
      } else if (code === 'Ds') {
        action = c.canDouble ? 'D' : 'S';
        note = c.canDouble ? 'Double.' : 'Double if allowed, but you can’t double here, so stand.';
      }
      trace.push(step('soft', total, col, code, note));
      return done(action);
    }
    if (soft) {
      // Only soft 12 (A,A you can't split) and soft 21 fall outside the chart.
      trace.push({ table: null, note: total === 21 ? 'Soft 21: stand.' : 'Soft 12 (two Aces you can’t split): hit.' });
      return done(total === 21 ? 'S' : 'H');
    }

    // 3b. Hard totals. Row "17" covers 17+, row "8" covers 8 and below.
    if (total > 21) {
      trace.push({ table: null, note: 'Bust.' });
      return done('S');
    }
    const rowKey = Math.max(8, Math.min(17, total));
    const code = lookup('hard', rowKey, col);
    let action = code;
    let note = CODE_INFO[code].long + '.';
    if (code === 'D') {
      action = c.canDouble ? 'D' : 'H';
      note = c.canDouble ? 'Double.' : 'Double if allowed, but you can’t double here, so hit.';
    }
    trace.push(step('hard', rowKey, col, code, note));
    return done(action);
  }

  // ---------------------------------------------------------------------------
  // Building example hands for a chart cell (used by the drill and the chart).
  // ---------------------------------------------------------------------------
  const COMBO_VALUES = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const comboCache = new Map();
  const vRank = (v) => (v === 11 ? 'A' : String(v));
  const fromValues = (vals) => vals.map((v) => ({ rank: vRank(v) }));

  function fitsCell(table, rowKey, vals) {
    const hand = fromValues(vals);
    const { total, soft } = Cards.handTotal(hand);
    if (table === 'pairs') return vals.length === 2 && vals[0] === rowKey && vals[1] === rowKey;
    if (vals.length === 2 && (Cards.isPair(hand) || total === 21)) return false;
    if (table === 'soft') {
      if (!soft || total !== rowKey) return false;
    } else {
      if (soft) return false;
      const ok = rowKey === 17 ? total >= 17 && total <= 20 : rowKey === 8 ? total <= 8 : total === rowKey;
      if (!ok) return false;
    }
    if (vals.length > 2) {
      // The first two cards must be a hand someone would realistically have hit.
      const first = fromValues(vals.slice(0, 2));
      const p = Cards.handTotal(first);
      if (p.total === 21) return false;
      if (Cards.isPair(first) && (vals[0] === 11 || vals[0] === 8)) return false; // always split
      if (p.soft ? p.total > 18 : p.total >= 17) return false;
    }
    return true;
  }

  function combos(table, rowKey, n) {
    const key = `${table}:${rowKey}:${n}`;
    if (comboCache.has(key)) return comboCache.get(key);
    const out = [];
    const walk = (prefix) => {
      if (prefix.length === n) {
        if (fitsCell(table, rowKey, prefix)) out.push(prefix.slice());
        return;
      }
      for (const v of COMBO_VALUES) {
        prefix.push(v);
        walk(prefix);
        prefix.pop();
      }
    };
    walk([]);
    comboCache.set(key, out);
    return out;
  }

  function assignSuits(ranks, rng) {
    const used = new Set();
    return ranks.map((rank) => {
      const free = Cards.SUITS.filter((s) => !used.has(rank + s));
      const suit = free[Math.floor(rng() * free.length)];
      used.add(rank + suit);
      return Cards.makeCard(rank, suit);
    });
  }

  /**
   * Deal a realistic hand for a chart cell: { player: Card[], dealer: Card }.
   * table 'surrender' is treated as the matching hard total.
   * nCards = 3 builds a "hit once already" hand where possible (never for pairs).
   */
  function makeDeal(table, rowKey, col, nCards, rng) {
    rng = rng || Math.random;
    if (table === 'surrender') table = 'hard';
    let n = table === 'pairs' ? 2 : nCards || 2;
    let list = combos(table, rowKey, n);
    if (!list.length && n > 2) {
      n = 2;
      list = combos(table, rowKey, 2);
    }
    const pickTen = () => Cards.TEN_RANKS[Math.floor(rng() * Cards.TEN_RANKS.length)];
    const vals = list[Math.floor(rng() * list.length)];
    const ranks = vals.map((v) => (v === 10 ? pickTen() : vRank(v)));
    const upV = UPCARDS[col];
    ranks.push(upV === 10 ? pickTen() : vRank(upV));
    const all = assignSuits(ranks, rng);
    return { player: all.slice(0, -1), dealer: all[all.length - 1] };
  }

  function hasThreeCardVersion(table, rowKey) {
    return table !== 'pairs' && combos(table === 'surrender' ? 'hard' : table, rowKey, 3).length > 0;
  }

  /** Every cell the drill can ask about, as { table, rowKey, col, id }. */
  function allCells(tables) {
    const out = [];
    for (const t of tables || ['pairs', 'soft', 'hard']) {
      for (const r of TABLES[t].rows) {
        for (let col = 0; col < 10; col++) out.push({ table: t, rowKey: r.key, col, id: `${t}:${r.key}:${UP_LABELS[col]}` });
      }
    }
    return out;
  }

  const Strategy = {
    UPCARDS,
    UP_LABELS,
    TABLE_ORDER,
    TABLES,
    CODE_INFO,
    LEGEND,
    ACTION_NAMES,
    ROW_TIPS,
    MEMORY_AIDS,
    getRow,
    lookup,
    colOf,
    canDoubleByRule,
    describeHand,
    cellIdFor,
    parseCellId,
    decide,
    makeDeal,
    hasThreeCardVersion,
    allCells,
  };
  BJ.Strategy = Strategy;
  if (typeof module !== 'undefined' && module.exports) module.exports = Strategy;
})(typeof window !== 'undefined' ? window : globalThis);
