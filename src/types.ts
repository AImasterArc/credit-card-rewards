export type ID = string;

export type RoundingMode = 'floor' | 'round';
export type ResetPeriod = 'billing' | 'calendarMonth';

/** 通路類型（固定三種，可複選） */
export const CHANNEL_TYPES = ['實體', '網路', '行動支付'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_TYPE_COLORS: Record<ChannelType, string> = {
  實體: '#007aff',
  網路: '#af52de',
  行動支付: '#34c759',
};

/** 通路類型 / 分類相容物件 */
export interface Category {
  id: ID;
  name: string;
  color: string;
  sortOrder: number;
  archived: boolean;
}

export interface Card {
  id: ID;
  name: string;
  bank: string;
  last4?: string;
  color: string;
  /** 1–31；當月沒有這天時取當月最後一天 */
  statementDay: number;
  roundingMode: RoundingMode;
  archived: boolean;
  sortOrder: number;
  note?: string;
  createdAt: number;
}

/**
 * 回饋規則：同一張卡依通路類型套用（可複選）。
 * 全選（實體、網路、行動支付）即為全通路 / 一般消費保底。
 * 超過上限的部分改用該卡全通路/一般消費規則計算。
 */
export interface RewardRule {
  id: ID;
  cardId: ID;
  channelTypes: ChannelType[];
  /** 百分比，3 = 3% */
  rate: number;
  /** 每期消費上限；null = 無上限 */
  capAmount: number | null;
  resetPeriod: ResetPeriod;
  /** 活動結束（YYYY-MM-DD），選填 */
  validTo?: string;
  channels: string[];
  note: string;
  enabled: boolean;
  /** 向下相容選填欄位 */
  categoryId?: ID;
  validFrom?: string;
  priority?: number;
}

export interface Allocation {
  ruleId: ID;
  spend: number;
  reward: number;
}

export interface Transaction {
  id: ID;
  cardId: ID;
  channelTypes: ChannelType[];
  /** 負數 = 退款 */
  amount: number;
  /** YYYY-MM-DD（消費日） */
  date: string;
  channel: string;
  note: string;
  /** 計算快照 */
  allocations: Allocation[];
  /** 該筆回饋（已依卡片取整） */
  reward: number;
  createdAt: number;
  /** 向下相容選填欄位 */
  categoryId?: ID;
}

export interface BackupFile {
  app: 'cc-rewards';
  version: 1;
  exportedAt: string;
  categories: Category[];
  cards: Card[];
  rules: RewardRule[];
  txns: Transaction[];
}
