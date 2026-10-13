import Dexie, { type Table } from 'dexie';
import type { Card, Category, RewardRule, Transaction, BackupFile } from './types';
import { GENERAL_CATEGORY_ID, reallocate, rulePeriod } from './lib/rewards';
import { today } from './lib/date';

const SEED_CATEGORIES: Category[] = [
  { id: GENERAL_CATEGORY_ID, name: '一般消費', color: '#8e8e93', sortOrder: 0, archived: false },
  { id: 'designated', name: '指定通路', color: '#ff9500', sortOrder: 1, archived: false },
  { id: 'overseas', name: '國外消費', color: '#007aff', sortOrder: 2, archived: false },
  { id: 'mobilepay', name: '行動支付', color: '#34c759', sortOrder: 3, archived: false },
  { id: 'online', name: '網購', color: '#af52de', sortOrder: 4, archived: false },
  { id: 'dining', name: '餐飲', color: '#ff2d55', sortOrder: 5, archived: false },
  { id: 'transport', name: '交通', color: '#5ac8fa', sortOrder: 6, archived: false },
  { id: 'bills', name: '保費 / 繳稅', color: '#a2845e', sortOrder: 7, archived: false },
];

class AppDb extends Dexie {
  categories!: Table<Category, string>;
  cards!: Table<Card, string>;
  rules!: Table<RewardRule, string>;
  txns!: Table<Transaction, string>;

  constructor() {
    super('cc-rewards');
    this.version(1).stores({
      categories: 'id, sortOrder',
      cards: 'id, sortOrder',
      rules: 'id, cardId, categoryId',
      txns: 'id, cardId, categoryId, date',
    });
    this.on('populate', (tx) => {
      void tx.table('categories').bulkAdd(SEED_CATEGORIES);
    });
  }
}

export const db = new AppDb();

/** 重算某卡 fromYmd（含）之後的交易 */
export async function recomputeCard(cardId: string, fromYmd: string): Promise<void> {
  await db.transaction('rw', db.cards, db.rules, db.txns, async () => {
    const card = await db.cards.get(cardId);
    if (!card) return;
    const rules = await db.rules.where('cardId').equals(cardId).toArray();
    const txns = await db.txns.where('cardId').equals(cardId).toArray();
    const changed = reallocate(card, rules, txns, fromYmd);
    if (changed.length) await db.txns.bulkPut(changed);
  });
}

export async function saveTransaction(txn: Transaction, previous?: Transaction): Promise<void> {
  await db.txns.put(txn);
  const sameCard = previous?.cardId === txn.cardId;
  const from = sameCard && previous.date < txn.date ? previous.date : txn.date;
  await recomputeCard(txn.cardId, from);
  if (previous && !sameCard) await recomputeCard(previous.cardId, previous.date);
}

export async function deleteTransaction(txn: Transaction): Promise<void> {
  await db.txns.delete(txn.id);
  await recomputeCard(txn.cardId, txn.date);
}

/** 儲存卡片與整組規則；規則異動後重算「目前週期」（歷史週期保留快照） */
export async function saveCardWithRules(card: Card, rules: RewardRule[]): Promise<void> {
  await db.transaction('rw', db.cards, db.rules, async () => {
    await db.cards.put(card);
    const existing = await db.rules.where('cardId').equals(card.id).primaryKeys();
    const keep = new Set(rules.map((r) => r.id));
    await db.rules.bulkDelete(existing.filter((id) => !keep.has(id)));
    await db.rules.bulkPut(rules);
  });
  const t = today();
  const starts = rules.map((r) => rulePeriod(r, card, t)[0]);
  const from = starts.length ? starts.sort()[0] : t;
  await recomputeCard(card.id, from);
}

export async function deleteCardPermanently(cardId: string): Promise<void> {
  await db.transaction('rw', db.cards, db.rules, db.txns, async () => {
    await db.txns.where('cardId').equals(cardId).delete();
    await db.rules.where('cardId').equals(cardId).delete();
    await db.cards.delete(cardId);
  });
}

export async function exportBackup(): Promise<BackupFile> {
  const [categories, cards, rules, txns] = await Promise.all([
    db.categories.toArray(),
    db.cards.toArray(),
    db.rules.toArray(),
    db.txns.toArray(),
  ]);
  return {
    app: 'cc-rewards',
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    cards,
    rules,
    txns,
  };
}

export function isBackupFile(v: unknown): v is BackupFile {
  const b = v as BackupFile;
  return (
    !!b &&
    b.app === 'cc-rewards' &&
    Array.isArray(b.categories) &&
    Array.isArray(b.cards) &&
    Array.isArray(b.rules) &&
    Array.isArray(b.txns)
  );
}

export async function importBackup(data: BackupFile): Promise<void> {
  await db.transaction('rw', db.categories, db.cards, db.rules, db.txns, async () => {
    await Promise.all([db.categories.clear(), db.cards.clear(), db.rules.clear(), db.txns.clear()]);
    await db.categories.bulkPut(data.categories);
    await db.cards.bulkPut(data.cards);
    await db.rules.bulkPut(data.rules);
    await db.txns.bulkPut(data.txns);
  });
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', db.categories, db.cards, db.rules, db.txns, async () => {
    await Promise.all([db.categories.clear(), db.cards.clear(), db.rules.clear(), db.txns.clear()]);
    await db.categories.bulkPut(SEED_CATEGORIES);
  });
}
