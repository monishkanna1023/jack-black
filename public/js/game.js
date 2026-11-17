/* Single-deck blackjack round engine. No DOM — also loadable from Node for tests.
   Rules: dealer peeks for blackjack with an A or 10 up (US hole card), late surrender,
   split up to 4 hands, split Aces get one card each and can't be resplit. */
(function (global) {
  'use strict';
  const BJ = global.BJ || (global.BJ = {});
  const { Shoe, handTotal, isBlackjack, isPair, value } = BJ.Cards;

  const DEFAULT_RULES = {
    decks: 1,
    h17: true, // dealer hits soft 17
    das: true, // double after split
    surrender: true, // late surrender
    doubleRule: 'any', // 'any' | '9-11' | '10-11'
    bjPayout: 1.5, // 3:2 (1.2 = 6:5)
    maxHands: 4,
    penetration: 0.65, // reshuffle once ~65% of the deck has been dealt
  };

  class Game {
    constructor(rules, opts) {
      opts = opts || {};
      this.rules = Object.assign({}, DEFAULT_RULES, rules || {});
      this.shoe = opts.shoe || new Shoe(this.rules.decks, opts.rng);
      this.bankroll = opts.bankroll != null ? opts.bankroll : 1000;
      this.phase = 'idle'; // idle | insurance | player | done
      this.round = 0;
      this.drawSeq = 0; // order cards come out of the shoe (for dealing animations)
      this.hands = [];
      this.dealer = [];
      this.active = 0;
      this.holeRevealed = false;
      this.insuranceBet = 0;
      this.insuranceResult = null;
      this.dealerBlackjack = false;
      this.justShuffled = false;
      this.startBankroll = this.bankroll;
      this.net = 0;
    }

    setRules(rules) {
      Object.assign(this.rules, rules);
    }

    get dealerUp() {
      return this.dealer[0];
    }

    get activeHand() {
      return this.phase === 'player' ? this.hands[this.active] : null;
    }

    get inRound() {
      return this.phase === 'insurance' || this.phase === 'player';
    }

    _newHand(bet) {
      return { cards: [], bet, fromSplit: false, splitAces: false, doubled: false, done: false, result: null };
    }

    _draw() {
      const c = this.shoe.draw();
      c.seq = ++this.drawSeq;
      return c;
    }

    _clearTable() {
      for (const h of this.hands) this.shoe.discard(h.cards);
      this.shoe.discard(this.dealer);
      this.hands = [];
      this.dealer = [];
    }

    deal(bet) {
      if (this.inRound) throw new Error('Round already in progress');
      if (!(bet > 0) || bet > this.bankroll) throw new Error('Invalid bet');
      this._clearTable();
      this.justShuffled = false;
      if (this.shoe.needsShuffle(this.rules.penetration)) {
        this.shoe.shuffle();
        this.justShuffled = true;
      }
      this.round++;
      this.startBankroll = this.bankroll;
      this.bankroll -= bet;
      this.active = 0;
      this.holeRevealed = false;
      this.insuranceBet = 0;
      this.insuranceResult = null;
      this.dealerBlackjack = false;
      const hand = this._newHand(bet);
      this.hands = [hand];
      hand.cards.push(this._draw());
      this.dealer.push(this._draw());
      hand.cards.push(this._draw());
      this.dealer.push(this._draw()); // hole card
      if (value(this.dealer[0].rank) === 11) {
        this.phase = 'insurance';
        return;
      }
      this._peekAndStart();
    }

    canAffordInsurance() {
      return this.phase === 'insurance' && this.bankroll >= this.hands[0].bet / 2;
    }

    /** Answer the insurance / even-money offer (dealer shows an Ace). */
    insurance(take) {
      if (this.phase !== 'insurance') throw new Error('No insurance offer');
      if (take) {
        if (!this.canAffordInsurance()) throw new Error('Not enough bankroll for insurance');
        this.insuranceBet = this.hands[0].bet / 2;
        this.bankroll -= this.insuranceBet;
      }
      this._peekAndStart();
    }

    _peekAndStart() {
      const h = this.hands[0];
      const upV = value(this.dealer[0].rank);
      if ((upV === 10 || upV === 11) && isBlackjack(this.dealer)) {
        this.dealerBlackjack = true;
        if (this.insuranceBet) {
          this.bankroll += this.insuranceBet * 3; // pays 2:1
          this.insuranceResult = 'won';
        }
        if (isBlackjack(h.cards)) {
          h.result = 'push';
          this.bankroll += h.bet;
        } else {
          h.result = 'lose';
        }
        h.done = true;
        return this._finish();
      }
      if (this.insuranceBet) this.insuranceResult = 'lost';
      if (isBlackjack(h.cards)) {
        h.result = 'blackjack';
        h.done = true;
        this.bankroll += h.bet + h.bet * this.rules.bjPayout;
        return this._finish();
      }
      this.phase = 'player';
      this.active = 0;
    }

    /** Which actions are legal for the active hand right now. */
    available() {
      const h = this.activeHand;
      if (!h) return { H: false, S: false, D: false, P: false, R: false };
      const two = h.cards.length === 2;
      const t = handTotal(h.cards);
      return {
        H: true,
        S: true,
        D:
          two &&
          (!h.fromSplit || this.rules.das) &&
          BJ.Strategy.canDoubleByRule(t.total, t.soft, this.rules.doubleRule) &&
          this.bankroll >= h.bet,
        P: two && isPair(h.cards) && this.hands.length < this.rules.maxHands && !h.splitAces && this.bankroll >= h.bet,
        R: two && this.rules.surrender && this.hands.length === 1 && !h.fromSplit,
      };
    }

    /** Context for BJ.Strategy.decide() matching what's legal for the active hand. */
    strategyContext() {
      const a = this.available();
      return { canSplit: a.P, canDouble: a.D, canSurrender: a.R, das: this.rules.das };
    }

    act(action) {
      const h = this.activeHand;
      if (!h) throw new Error('No active hand');
      if (!this.available()[action]) throw new Error(`Action ${action} is not allowed now`);
      switch (action) {
        case 'H':
          h.cards.push(this._draw());
          this._checkHand(h);
          break;
        case 'S':
          h.done = true;
          break;
        case 'D':
          this.bankroll -= h.bet;
          h.bet *= 2;
          h.doubled = true;
          h.cards.push(this._draw());
          h.done = true;
          this._checkHand(h);
          break;
        case 'P': {
          this.bankroll -= h.bet;
          const moved = h.cards.pop();
          const nh = this._newHand(h.bet);
          nh.cards.push(moved);
          nh.fromSplit = h.fromSplit = true;
          if (value(moved.rank) === 11) nh.splitAces = h.splitAces = true;
          this.hands.splice(this.active + 1, 0, nh);
          h.cards.push(this._draw());
          if (h.splitAces) h.done = true;
          else this._checkHand(h);
          break;
        }
        case 'R':
          h.result = 'surrender';
          h.done = true;
          this.bankroll += h.bet / 2;
          break;
        default:
          throw new Error('Unknown action ' + action);
      }
      this._advance();
    }

    _checkHand(h) {
      const t = handTotal(h.cards).total;
      if (t > 21) {
        h.result = 'bust';
        h.done = true;
      } else if (t === 21) {
        h.done = true; // auto-stand on 21
      }
    }

    _advance() {
      while (this.active < this.hands.length && this.hands[this.active].done) {
        this.active++;
        const nh = this.hands[this.active];
        if (nh && nh.cards.length === 1) {
          // Split hands get their second card when you reach them.
          nh.cards.push(this._draw());
          if (nh.splitAces) nh.done = true;
          else this._checkHand(nh);
        }
      }
      if (this.active >= this.hands.length) this._dealerPlay();
    }

    dealerShouldHit() {
      const t = handTotal(this.dealer);
      return t.total < 17 || (t.total === 17 && t.soft && this.rules.h17);
    }

    _dealerPlay() {
      this.holeRevealed = true;
      const live = this.hands.some((h) => h.result !== 'bust' && h.result !== 'surrender');
      if (live) while (this.dealerShouldHit()) this.dealer.push(this._draw());
      const d = handTotal(this.dealer).total;
      for (const h of this.hands) {
        if (h.result) continue;
        const p = handTotal(h.cards).total;
        if (d > 21 || p > d) {
          h.result = 'win';
          this.bankroll += h.bet * 2;
        } else if (p === d) {
          h.result = 'push';
          this.bankroll += h.bet;
        } else {
          h.result = 'lose';
        }
      }
      this._finish();
    }

    _finish() {
      this.phase = 'done';
      this.holeRevealed = true;
      this.net = this.bankroll - this.startBankroll;
    }
  }

  BJ.Game = Game;
  BJ.Game.DEFAULT_RULES = DEFAULT_RULES;
  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
})(typeof window !== 'undefined' ? window : globalThis);
