import type { Card, RewardRule, Transaction, Allocation, RoundingMode } from '../types';
import { getBillingCycle, getCalendarMonth } from './date';

export const GENERAL_CATEGORY_ID = 'general';

export function roundReward(value: number, mode: RoundingMode): number {
  const sign = Math.sign(value);
  return sign * Math[mode](Math.abs(value) + 1e-9);
}

export function isRuleActive(rule: RewardRule, dateYmd: string): boolean {
  if (!rule.enabled) return false;
  if (rule.validFrom && dateYmd < rule.validFrom) return false;
  if (rule.validTo && dateYmd > rule.validTo) return false;
  return true;
}

export function rulePeriod(rule: RewardRule, card: Card, dateYmd: string): [string, string] {
  return rule.resetPeriod === 'calendarMonth'
    ? getCalendarMonth(dateYmd)
    : getBillingCycle(card.statementDay, dateYmd);
}

/** 某規則在 dateYmd 所屬週期內已使用的消費金額 */
export function usedSpend(
  rule: RewardRule,
  card: Card,
  dateYmd: string,
  txns: readonly Transaction[],
): number {
  const [start, end] = rulePeriod(rule, card, dateYmd);
  let sum = 0;
  for (const t of txns) {
    if (t.cardId !== card.id || t.date < start || t.date > end) continue;
    for (const a of t.allocations) if (a.ruleId === rule.id) sum += a.spend;
  }
  return sum;
}

export function remainingSpend(
  rule: RewardRule,
  card: Card,
  dateYmd: string,
  txns: readonly Transaction[],
): number {
  if (rule.capAmount == null) return Infinity;
  return Math.max(0, rule.capAmount - usedSpend(rule, card, dateYmd, txns));
}

const byPriority = (a: RewardRule, b: RewardRule): number => a.priority - b.priority;

export function matchingRules(
  rules: readonly RewardRule[],
  cardId: string,
  categoryId: string,
  dateYmd: string,
): RewardRule[] {
  return rules
    .filter((r) => r.cardId === cardId && r.categoryId === categoryId && isRuleActive(r, dateYmd))
    .sort(byPriority);
}

export interface AllocationResult {
  allocations: Allocation[];
  reward: number;
  /** 沒有任何規則承接的金額（0% 回饋） */
  unrewarded: number;
  /** 有使用到一般消費作為備援 */
  usedFallback: boolean;
}

/**
 * 依序吃額度：指定類型規則（priority 小的先）→ 超出部分改用一般消費規則 → 剩下的不回饋。
 * 退款（負數）直接沖回第一條符合的規則。
 */
export function allocate(
  amount: number,
  categoryId: string,
  card: Card,
  rules: readonly RewardRule[],
  dateYmd: string,
  priorTxns: readonly Transaction[],
): AllocationResult {
  const designated = matchingRules(rules, card.id, categoryId, dateYmd);
  const fallback =
    categoryId === GENERAL_CATEGORY_ID
      ? []
      : matchingRules(rules, card.id, GENERAL_CATEGORY_ID, dateYmd);

  if (amount < 0) {
    const target = designated[0] ?? fallback[0];
    if (!target) return { allocations: [], reward: 0, unrewarded: amount, usedFallback: false };
    const raw = (amount * target.rate) / 100;
    return {
      allocations: [{ ruleId: target.id, spend: amount, reward: raw }],
      reward: roundReward(raw, card.roundingMode),
      unrewarded: 0,
      usedFallback: !designated[0],
    };
  }

  const allocations: Allocation[] = [];
  let left = amount;
  let usedFallback = false;

  const consume = (list: RewardRule[], isFallback: boolean): void => {
    for (const r of list) {
      if (left <= 0) return;
      const take = Math.min(left, remainingSpend(r, card, dateYmd, priorTxns));
      if (take <= 0) continue;
      allocations.push({ ruleId: r.id, spend: take, reward: (take * r.rate) / 100 });
      left -= take;
      if (isFallback) usedFallback = true;
    }
  };

  consume(designated, false);
  consume(fallback, true);

  const raw = allocations.reduce((s, a) => s + a.reward, 0);
  return {
    allocations,
    reward: roundReward(raw, card.roundingMode),
    unrewarded: left,
    usedFallback,
  };
}

const txnOrder = (a: Transaction, b: Transaction): number =>
  a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1;

/**
 * 從 fromYmd（含）開始依時間順序重算該卡交易的 allocations。
 * 較早的交易不受影響，所以只需要重算 fromYmd 之後的部分。
 */
export function reallocate(
  card: Card,
  rules: readonly RewardRule[],
  txns: readonly Transaction[],
  fromYmd: string,
): Transaction[] {
  const sorted = txns.filter((t) => t.cardId === card.id).sort(txnOrder);
  const done: Transaction[] = [];
  const changed: Transaction[] = [];
  for (const t of sorted) {
    if (t.date < fromYmd) {
      done.push(t);
      continue;
    }
    const { allocations, reward } = allocate(t.amount, t.categoryId, card, rules, t.date, done);
    const next = { ...t, allocations, reward };
    done.push(next);
    changed.push(next);
  }
  return changed;
}

export interface Recommendation {
  card: Card;
  reward: number;
  effectiveRate: number;
  /** 此卡這個類型的規則 */
  rules: RewardRule[];
  /** 此類型剩餘額度總和（Infinity = 無上限） */
  remaining: number;
  remainingByRule: Record<string, number>;
  hasDesignated: boolean;
  /** 指定類型額度全部用完 */
  capped: boolean;
  usedFallback: boolean;
  fallbackRule?: RewardRule;
  /** 輸入的通路命中規則通路清單 */
  channelHit: boolean;
  /** 有輸入通路、規則有列通路，但都不符合 */
  channelMiss: boolean;
  allocation: AllocationResult;
}

const normalize = (s: string): string => s.trim().toLowerCase();

export function channelMatches(ruleChannels: readonly string[], channel: string): boolean {
  const q = normalize(channel);
  if (!q) return false;
  return ruleChannels.some((c) => {
    const n = normalize(c);
    return n === q || n.includes(q) || q.includes(n);
  });
}

export function recommend(params: {
  categoryId: string;
  amount: number;
  date: string;
  channel: string;
  cards: readonly Card[];
  rules: readonly RewardRule[];
  txns: readonly Transaction[];
}): Recommendation[] {
  const { categoryId, amount, date, channel, cards, rules, txns } = params;
  const hasChannel = normalize(channel).length > 0;

  const list = cards
    .filter((c) => !c.archived)
    .map<Recommendation>((card) => {
      const cardTxns = txns.filter((t) => t.cardId === card.id);
      const designated = matchingRules(rules, card.id, categoryId, date);
      const fallbackRule =
        categoryId === GENERAL_CATEGORY_ID
          ? undefined
          : matchingRules(rules, card.id, GENERAL_CATEGORY_ID, date)[0];
      const allocation = allocate(amount, categoryId, card, rules, date, cardTxns);
      const remainingByRule: Record<string, number> = {};
      for (const r of designated) remainingByRule[r.id] = remainingSpend(r, card, date, cardTxns);
      const remaining = Object.values(remainingByRule).reduce((s, v) => s + v, 0);
      const withChannels = designated.filter((r) => r.channels.length > 0);
      const channelHit = hasChannel && designated.some((r) => channelMatches(r.channels, channel));
      return {
        card,
        reward: allocation.reward,
        effectiveRate: amount > 0 ? (allocation.reward / amount) * 100 : 0,
        rules: designated,
        remaining,
        remainingByRule,
        hasDesignated: designated.length > 0,
        capped: designated.length > 0 && remaining <= 0,
        usedFallback: allocation.usedFallback,
        fallbackRule,
        channelHit,
        channelMiss: hasChannel && withChannels.length > 0 && !channelHit,
        allocation,
      };
    });

  return list.sort(
    (a, b) =>
      Number(a.channelMiss) - Number(b.channelMiss) ||
      b.reward - a.reward ||
      Number(b.channelHit) - Number(a.channelHit) ||
      b.remaining - a.remaining ||
      a.card.sortOrder - b.card.sortOrder,
  );
}
