import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  deleteTransaction,
  exportBackup,
  importBackup,
  isBackupFile,
  resetAll,
  saveCardWithRules,
  saveTransaction,
} from './db';
import { GENERAL_CATEGORY_ID } from './lib/rewards';
import type { Card, RewardRule, Transaction } from './types';

const CARD: Card = {
  id: 'c1',
  name: 'Test',
  bank: '',
  color: '#000',
  statementDay: 15,
  roundingMode: 'round',
  archived: false,
  sortOrder: 0,
  createdAt: 0,
};

const RULES: RewardRule[] = [
  { id: 'base', cardId: 'c1', categoryId: GENERAL_CATEGORY_ID, rate: 0.5, capAmount: null, resetPeriod: 'billing', channels: [], note: '', priority: 0, enabled: true },
  { id: 'dine', cardId: 'c1', categoryId: 'dining', rate: 3, capAmount: 1000, resetPeriod: 'billing', channels: ['麥當勞'], note: '需登錄', priority: 0, enabled: true },
];

let seq = 0;
const mk = (p: Partial<Transaction>): Transaction => ({
  id: `t${++seq}`,
  cardId: 'c1',
  categoryId: 'dining',
  amount: 0,
  date: '2026-10-10',
  channel: '',
  note: '',
  allocations: [],
  reward: 0,
  createdAt: seq,
  ...p,
});

const get = async (id: string): Promise<Transaction> => (await db.txns.get(id))!;

beforeEach(async () => {
  await resetAll();
  await saveCardWithRules(CARD, RULES);
});

describe('seed', () => {
  it('has default categories including 一般消費', async () => {
    const cats = await db.categories.toArray();
    expect(cats.length).toBeGreaterThanOrEqual(8);
    expect(cats.some((c) => c.id === GENERAL_CATEGORY_ID)).toBe(true);
  });
});

describe('saveTransaction', () => {
  it('computes reward and splits across cap', async () => {
    await saveTransaction(mk({ id: 'a', amount: 800 }));
    await saveTransaction(mk({ id: 'b', amount: 500 }));
    expect((await get('a')).reward).toBe(24);
    const b = await get('b');
    expect(b.allocations.map((x) => [x.ruleId, x.spend])).toEqual([['dine', 200], ['base', 300]]);
    expect(b.reward).toBe(8); // 6 + 1.5 -> round(7.5)=8
  });

  it('deleting an earlier txn gives quota back to later ones', async () => {
    await saveTransaction(mk({ id: 'a', amount: 1000, date: '2026-10-01' }));
    await saveTransaction(mk({ id: 'b', amount: 500, date: '2026-10-02' }));
    expect((await get('b')).reward).toBe(3); // all at 0.5%
    await deleteTransaction(await get('a'));
    expect((await get('b')).reward).toBe(15);
  });

  it('editing amount recomputes later txns', async () => {
    await saveTransaction(mk({ id: 'a', amount: 1000, date: '2026-10-01' }));
    await saveTransaction(mk({ id: 'b', amount: 500, date: '2026-10-02' }));
    const a = await get('a');
    await saveTransaction({ ...a, amount: 200 }, a);
    expect((await get('b')).reward).toBe(15);
  });

  it('moving a txn to an earlier date recomputes in chronological order', async () => {
    await saveTransaction(mk({ id: 'a', amount: 1000, date: '2026-10-05' }));
    await saveTransaction(mk({ id: 'b', amount: 1000, date: '2026-10-08' }));
    const b = await get('b');
    expect(b.reward).toBe(5);
    await saveTransaction({ ...b, date: '2026-10-01' }, b);
    expect((await get('b')).reward).toBe(30);
    expect((await get('a')).reward).toBe(5);
  });

  it('changing card recomputes both cards', async () => {
    await db.cards.put({ ...CARD, id: 'c2', name: 'Other', sortOrder: 1 });
    await db.rules.put({ ...RULES[1], id: 'dine2', cardId: 'c2', rate: 1 });
    await saveTransaction(mk({ id: 'a', amount: 1000 }));
    await saveTransaction(mk({ id: 'b', amount: 500 }));
    const a = await get('a');
    await saveTransaction({ ...a, cardId: 'c2' }, a);
    expect((await get('b')).reward).toBe(15);
    expect((await get('a')).reward).toBe(10);
  });

  it('billing cycle boundary resets quota', async () => {
    await saveTransaction(mk({ id: 'a', amount: 1000, date: '2026-10-15' }));
    await saveTransaction(mk({ id: 'b', amount: 1000, date: '2026-10-16' }));
    expect((await get('b')).reward).toBe(30);
  });
});

describe('rule edits', () => {
  it('raising cap recomputes current-cycle txns', async () => {
    const t = new Date();
    const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    await saveTransaction(mk({ id: 'a', amount: 2000, date }));
    expect((await get('a')).reward).toBe(35); // 1000*3% + 1000*0.5%
    await saveCardWithRules(CARD, [RULES[0], { ...RULES[1], capAmount: 2000 }]);
    expect((await get('a')).reward).toBe(60);
  });

  it('removing a rule falls back to general', async () => {
    const t = new Date();
    const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    await saveTransaction(mk({ id: 'a', amount: 1000, date }));
    await saveCardWithRules(CARD, [RULES[0]]);
    expect((await get('a')).reward).toBe(5);
    expect(await db.rules.where('cardId').equals('c1').count()).toBe(1);
  });
});

describe('backup', () => {
  it('round-trips', async () => {
    await saveTransaction(mk({ id: 'a', amount: 300 }));
    const data = await exportBackup();
    expect(isBackupFile(JSON.parse(JSON.stringify(data)))).toBe(true);
    await resetAll();
    expect(await db.txns.count()).toBe(0);
    await importBackup(data);
    expect(await db.txns.count()).toBe(1);
    expect(await db.rules.count()).toBe(2);
  });

  it('rejects junk', () => {
    expect(isBackupFile({ app: 'other' })).toBe(false);
    expect(isBackupFile(null)).toBe(false);
  });
});
