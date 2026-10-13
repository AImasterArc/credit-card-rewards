import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Card, Category, RewardRule, Transaction } from './types';

interface DataState {
  categories: Category[];
  cards: Card[];
  rules: RewardRule[];
  txns: Transaction[];
  categoryMap: Map<string, Category>;
  cardMap: Map<string, Card>;
  ruleMap: Map<string, RewardRule>;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []);
  const cards = useLiveQuery(() => db.cards.orderBy('sortOrder').toArray(), []);
  const rules = useLiveQuery(() => db.rules.toArray(), []);
  const txns = useLiveQuery(() => db.txns.toArray(), []);

  const value = useMemo<DataState | null>(() => {
    if (!categories || !cards || !rules || !txns) return null;
    return {
      categories,
      cards,
      rules,
      txns,
      categoryMap: new Map(categories.map((c) => [c.id, c])),
      cardMap: new Map(cards.map((c) => [c.id, c])),
      ruleMap: new Map(rules.map((r) => [r.id, r])),
    };
  }, [categories, cards, rules, txns]);

  if (!value) return <div className="loading">載入中…</div>;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
