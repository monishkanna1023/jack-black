/* Cards, hand totals and a single-deck shoe. No DOM — also loadable from Node for tests. */
(function (global) {
  'use strict';
  const BJ = global.BJ || (global.BJ = {});

  const SUITS = ['♠', '♥', '♦', '♣'];
  const SUIT_NAMES = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const TEN_RANKS = ['10', 'J', 'Q', 'K'];
  let nextId = 1;

  function makeCard(rank, suit) {
    return { id: nextId++, rank, suit };
  }

  /** Blackjack value of a rank. Aces return 11 (handTotal demotes them to 1 as needed). */
  function value(rank) {
    if (rank === 'A') return 11;
    if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
    return parseInt(rank, 10);
  }

  /** { total, soft } — soft means an Ace is still being counted as 11. */
  function handTotal(cards) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
      const v = value(c.rank);
      if (v === 11) aces++;
      total += v;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return { total, soft: aces > 0 };
  }

  /** Two cards of the same value (any two ten-value cards count as a pair, e.g. K,Q). */
  function isPair(cards) {
    return cards.length === 2 && value(cards[0].rank) === value(cards[1].rank);
  }

  function isBlackjack(cards) {
    return cards.length === 2 && handTotal(cards).total === 21;
  }

  function isRed(card) {
    return card.suit === '♥' || card.suit === '♦';
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function freshDeck() {
    const deck = [];
    for (const s of SUITS) for (const r of RANKS) deck.push(makeCard(r, s));
    return deck;
  }

  /** A shoe holding `decks` decks (1 for this trainer). Cards are drawn from the end of `cards`. */
  class Shoe {
    constructor(decks, rng) {
      this.decks = decks || 1;
      this.rng = rng || Math.random;
      this.shuffles = 0;
      this.shuffle();
    }

    get size() {
      return 52 * this.decks;
    }

    get remaining() {
      return this.cards.length;
    }

    /** Fresh, fully shuffled shoe. Only call between rounds. */
    shuffle() {
      let all = [];
      for (let i = 0; i < this.decks; i++) all = all.concat(freshDeck());
      this.cards = shuffle(all, this.rng);
      this.discards = [];
      this.shuffles++;
    }

    draw() {
      if (this.cards.length === 0) {
        // Ran dry mid-round (rare with one deck and several splits): reshuffle the discards.
        this.cards = shuffle(this.discards, this.rng);
        this.discards = [];
        this.shuffles++;
      }
      if (this.cards.length === 0) throw new Error('No cards left to draw');
      return this.cards.pop();
    }

    discard(cards) {
      for (const c of cards) this.discards.push(c);
    }

    /** Cards left at which the deck gets reshuffled (18 for one deck at 65% penetration). */
    cutCard(penetration) {
      return Math.round(this.size * (1 - penetration));
    }

    needsShuffle(penetration) {
      return this.cards.length < this.cutCard(penetration);
    }
  }

  const Cards = {
    SUITS,
    SUIT_NAMES,
    RANKS,
    TEN_RANKS,
    makeCard,
    value,
    handTotal,
    isPair,
    isBlackjack,
    isRed,
    shuffle,
    freshDeck,
    Shoe,
  };
  BJ.Cards = Cards;
  if (typeof module !== 'undefined' && module.exports) module.exports = Cards;
})(typeof window !== 'undefined' ? window : globalThis);
