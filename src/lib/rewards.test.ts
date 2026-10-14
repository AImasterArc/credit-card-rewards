import { describe, expect, it } from 'vitest';
import { getBillingCycle } from './date';
import { allocate, reallocate, recommend } from './rewards';
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
  channelTypes: ['實體', '網路', '行動支付'],
  rate: 1,
  capAmount: null,
  resetPeriod: 'billing',
  channels: [],
  note: '',
  enabled: true,
  ...p,
});

const txn = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(),
  cardId: 'c1',
  channelTypes: ['實體'],
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
    rule({ id: 'base', channelTypes: ['實體', '網路', '行動支付'], rate: 0.5 }),
    rule({ id: 'pay', channelTypes: ['行動支付'], rate: 7, capAmount: 1000 }),
    rule({ id: 'online', channelTypes: ['網路'], rate: 3, capAmount: 2000 }),
  ];

  it('designated replaces general within cap', () => {
    const r = allocate(800, ['行動支付'], card(), rules, '2026-10-10', []);
    expect(r.allocations).toEqual([{ ruleId: 'pay', spend: 800, reward: 56 }]);
    expect(r.reward).toBe(56);
  });

  it('multi-select channelTypes matches highest designated rule', () => {
    // 實體 + 行動支付 (如在實體店家用 Apple Pay)
    const r = allocate(800, ['實體', '行動支付'], card(), rules, '2026-10-10', []);
    expect(r.allocations).toEqual([{ ruleId: 'pay', spend: 800, reward: 56 }]);
    expect(r.reward).toBe(56);
  });

  it('overflow falls back to general', () => {
    const prior = [txn({ allocations: [{ ruleId: 'pay', spend: 700, reward: 49 }] })];
    const r = allocate(500, ['行動支付'], card(), rules, '2026-10-12', prior);
    expect(r.allocations.map((a) => [a.ruleId, a.spend])).toEqual([
      ['pay', 300],
      ['base', 200],
    ]);
    expect(r.reward).toBe(22); // 300*7% + 200*0.5% = 21 + 1
    expect(r.usedFallback).toBe(true);
  });

  it('cap resets next billing cycle', () => {
    const prior = [txn({ date: '2026-10-10', allocations: [{ ruleId: 'pay', spend: 1000, reward: 70 }] })];
    const r = allocate(500, ['行動支付'], card(), rules, '2026-10-16', prior);
    expect(r.allocations).toEqual([{ ruleId: 'pay', spend: 500, reward: 35 }]);
  });

  it('refund restores quota', () => {
    const r = allocate(-200, ['行動支付'], card(), rules, '2026-10-10', []);
    expect(r.allocations[0]).toMatchObject({ ruleId: 'pay', spend: -200 });
    expect(r.reward).toBe(-14);
  });
});

describe('reallocate', () => {
  it('recomputes chronologically after deletion', () => {
    const rules = [
      rule({ id: 'base', rate: 0.5 }),
      rule({ id: 'online', channelTypes: ['網路'], rate: 3, capAmount: 1000 }),
    ];
    const c = card();
    const t2 = txn({
      id: 't2',
      channelTypes: ['網路'],
      amount: 600,
      date: '2026-10-11',
      allocations: [
        { ruleId: 'online', spend: 200, reward: 6 },
        { ruleId: 'base', spend: 400, reward: 2 },
      ],
    });
    const changed = reallocate(c, rules, [t2], '2026-10-01');
    expect(changed[0].allocations).toEqual([{ ruleId: 'online', spend: 600, reward: 18 }]);
  });
});

describe('recommend', () => {
  it('ranks by reward and pushes capped card down', () => {
    const cards = [card({ id: 'c1', name: 'A' }), card({ id: 'c2', name: 'B', sortOrder: 1 })];
    const rules = [
      rule({ id: 'a1', cardId: 'c1', channelTypes: ['行動支付'], rate: 5, capAmount: 100 }),
      rule({ id: 'a0', cardId: 'c1', channelTypes: ['實體', '網路', '行動支付'], rate: 0.5 }),
      rule({ id: 'b1', cardId: 'c2', channelTypes: ['行動支付'], rate: 2 }),
    ];
    const txns = [txn({ cardId: 'c1', allocations: [{ ruleId: 'a1', spend: 100, reward: 5 }] })];
    const recs = recommend({
      channelTypes: ['行動支付'],
      amount: 1000,
      date: '2026-10-12',
      channel: '',
      cards,
      rules,
      txns,
    });
    expect(recs[0].card.id).toBe('c2');
    expect(recs[1].capped).toBe(true);
  });
});
