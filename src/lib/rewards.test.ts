import { describe, expect, it } from 'vitest';
import { getBillingCycle } from './date';
import { allocate, reallocate, recommend, GENERAL_CATEGORY_ID } from './rewards';
import type { Card, RewardRule, Transaction } from '../types';

const card = (p: Partial<Card> = {}): Card => ({
  id: 'c1',
  name: 'A',
  bank: '',
  color: '#000',
  statementDay: 15,
  roundingMode: 'round',
  archived: false,
  sortOrder: 0,
  createdAt: 0,
  ...p,
});

const rule = (p: Partial<RewardRule>): RewardRule => ({
  id: 'r',
  cardId: 'c1',
  categoryId: GENERAL_CATEGORY_ID,
  rate: 1,
  capAmount: null,
  resetPeriod: 'billing',
  channels: [],
  note: '',
  priority: 0,
  enabled: true,
  ...p,
});

const txn = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(),
  cardId: 'c1',
  categoryId: 'dining',
  amount: 0,
  date: '2026-10-10',
  channel: '',
  note: '',
  allocations: [],
  reward: 0,
  createdAt: 0,
  ...p,
});

describe('getBillingCycle', () => {
  it('statement day 15', () => {
    expect(getBillingCycle(15, '2026-10-10')).toEqual(['2026-09-16', '2026-10-15']);
    expect(getBillingCycle(15, '2026-10-15')).toEqual(['2026-09-16', '2026-10-15']);
    expect(getBillingCycle(15, '2026-10-16')).toEqual(['2026-10-16', '2026-11-15']);
  });
  it('statement day 31 clamps to month end', () => {
    expect(getBillingCycle(31, '2026-02-10')).toEqual(['2026-02-01', '2026-02-28']);
    expect(getBillingCycle(31, '2026-03-01')).toEqual(['2026-03-01', '2026-03-31']);
  });
  it('crosses year', () => {
    expect(getBillingCycle(5, '2026-12-20')).toEqual(['2026-12-06', '2027-01-05']);
    expect(getBillingCycle(5, '2027-01-03')).toEqual(['2026-12-06', '2027-01-05']);
  });
});

describe('allocate', () => {
  const rules = [
    rule({ id: 'base', categoryId: GENERAL_CATEGORY_ID, rate: 0.5 }),
    rule({ id: 'dine', categoryId: 'dining', rate: 3, capAmount: 1000 }),
  ];

  it('designated replaces general within cap', () => {
    const r = allocate(800, 'dining', card(), rules, '2026-10-10', []);
    expect(r.allocations).toEqual([{ ruleId: 'dine', spend: 800, reward: 24 }]);
    expect(r.reward).toBe(24);
  });

  it('overflow falls back to general', () => {
    const prior = [txn({ allocations: [{ ruleId: 'dine', spend: 700, reward: 21 }] })];
    const r = allocate(500, 'dining', card(), rules, '2026-10-12', prior);
    expect(r.allocations.map((a) => [a.ruleId, a.spend])).toEqual([
      ['dine', 300],
      ['base', 200],
    ]);
    expect(r.reward).toBe(10); // 9 + 1
    expect(r.usedFallback).toBe(true);
  });

  it('cap resets next billing cycle', () => {
    const prior = [txn({ date: '2026-10-10', allocations: [{ ruleId: 'dine', spend: 1000, reward: 30 }] })];
    const r = allocate(500, 'dining', card(), rules, '2026-10-16', prior);
    expect(r.allocations).toEqual([{ ruleId: 'dine', spend: 500, reward: 15 }]);
  });

  it('refund restores quota', () => {
    const r = allocate(-200, 'dining', card(), rules, '2026-10-10', []);
    expect(r.allocations[0]).toMatchObject({ ruleId: 'dine', spend: -200 });
    expect(r.reward).toBe(-6);
  });
});

describe('reallocate', () => {
  it('recomputes chronologically after deletion', () => {
    const rules = [rule({ id: 'base', rate: 0.5 }), rule({ id: 'dine', categoryId: 'dining', rate: 3, capAmount: 1000 })];
    const c = card();
    const t2 = txn({ id: 't2', amount: 600, date: '2026-10-11', allocations: [{ ruleId: 'dine', spend: 200, reward: 6 }, { ruleId: 'base', spend: 400, reward: 2 }] });
    // t1 (800) 已刪除，t2 應拿回完整 3%
    const changed = reallocate(c, rules, [t2], '2026-10-01');
    expect(changed[0].allocations).toEqual([{ ruleId: 'dine', spend: 600, reward: 18 }]);
  });
});

describe('recommend', () => {
  it('ranks by reward and pushes capped card down', () => {
    const cards = [card({ id: 'c1', name: 'A' }), card({ id: 'c2', name: 'B', sortOrder: 1 })];
    const rules = [
      rule({ id: 'a1', cardId: 'c1', categoryId: 'dining', rate: 5, capAmount: 100 }),
      rule({ id: 'a0', cardId: 'c1', rate: 0.5 }),
      rule({ id: 'b1', cardId: 'c2', categoryId: 'dining', rate: 2 }),
    ];
    const txns = [txn({ cardId: 'c1', allocations: [{ ruleId: 'a1', spend: 100, reward: 5 }] })];
    const recs = recommend({ categoryId: 'dining', amount: 1000, date: '2026-10-12', channel: '', cards, rules, txns });
    expect(recs[0].card.id).toBe('c2');
    expect(recs[1].capped).toBe(true);
  });
});
