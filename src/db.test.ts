import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  resetAll,
  saveCardWithRules,
  saveTransaction,
  deleteTransaction,
  exportBackup,
  importBackup,
  isBackupFile,
} from './db';
import { importCardsFromText } from './cardImport';
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
  { id: 'base', cardId: 'c1', channelTypes: ['實體', '網路', '行動支付'], rate: 0.5, capAmount: null, resetPeriod: 'billing', channels: [], note: '', enabled: true },
  { id: 'pay', cardId: 'c1', channelTypes: ['行動支付'], rate: 3, capAmount: 1000, resetPeriod: 'billing', channels: ['麥當勞'], note: '需登錄', enabled: true },
];

let seq = 0;
const mk = (p: Partial<Transaction>): Transaction => ({
  id: `t${++seq}`,
  cardId: 'c1',
  channelTypes: ['行動支付'],
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
  it('has default channel type categories', async () => {
    const cats = await db.categories.toArray();
    expect(cats.length).toBeGreaterThanOrEqual(3);
    expect(cats.some((c) => c.name === '實體')).toBe(true);
    expect(cats.some((c) => c.name === '網路')).toBe(true);
    expect(cats.some((c) => c.name === '行動支付')).toBe(true);
  });
});

describe('saveTransaction recomputation', () => {
  it('applies designated rule within cap and falls back after', async () => {
    await saveTransaction(mk({ id: 'a', amount: 800 }));
    expect((await get('a')).reward).toBe(24); // 800 * 3%

    await saveTransaction(mk({ id: 'b', amount: 500 }));
    // 200 * 3% + 300 * 0.5% = 6 + 1.5 = 7.5 -> round 8
    expect((await get('b')).reward).toBe(8);
  });

  it('deleting an earlier txn gives quota back to later txn', async () => {
    await saveTransaction(mk({ id: 'a', amount: 800, date: '2026-10-05' }));
    await saveTransaction(mk({ id: 'b', amount: 500, date: '2026-10-10' }));
    expect((await get('b')).reward).toBe(8);

    await deleteTransaction(await get('a'));
    expect((await get('b')).reward).toBe(15); // 500 * 3%
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
    await db.rules.put({ ...RULES[1], id: 'pay2', cardId: 'c2', rate: 1 });
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
    expect(data.txns.length).toBe(1);
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

describe('importCardsFromText', () => {
  it('imports cards and parses channelTypes correctly', async () => {
    const csv = `
卡片名稱,結帳日,通路類型,回饋%,每期消費上限,通路
全新卡片,20,實體|網路,5,3000,特約店A|特約店B
`;
    const res = await importCardsFromText(csv);
    expect(res).toContain('匯入完成');
    const card = (await db.cards.toArray()).find((c) => c.name === '全新卡片');
    expect(card).toBeDefined();
    expect(card!.statementDay).toBe(20);

    const rules = await db.rules.where('cardId').equals(card!.id).toArray();
    expect(rules.length).toBe(1);
    expect(rules[0].rate).toBe(5);
    expect(rules[0].capAmount).toBe(3000);
    expect(rules[0].channelTypes).toEqual(['實體', '網路']);
    expect(rules[0].channels).toEqual(['特約店A', '特約店B']);
  });

  it('updates existing card and replaces its rules while preserving other cards', async () => {
    const csv = `
卡片名稱,結帳日,通路類型,回饋%
Test,18,全通路,2
`;
    const res = await importCardsFromText(csv);
    expect(res).toContain('更新 1 張');
    const card = await db.cards.get('c1');
    expect(card).toBeDefined();
    expect(card!.statementDay).toBe(18);

    const rules = await db.rules.where('cardId').equals('c1').toArray();
    expect(rules.length).toBe(1);
    expect(rules[0].rate).toBe(2);
    expect(rules[0].channelTypes).toEqual(['實體', '網路', '行動支付']);
  });
});
