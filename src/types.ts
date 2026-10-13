export type ID = string;

export type RoundingMode = 'floor' | 'round';
export type ResetPeriod = 'billing' | 'calendarMonth';

/** 消費類型（獨立資料表，可擴增） */
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
 * 回饋規則：同一張卡依消費類型套用。
 * 指定類型的規則「取代」一般消費；超過上限的部分改用該卡「一般消費」規則計算。
 */
export interface RewardRule {
  id: ID;
  cardId: ID;
  categoryId: ID;
  /** 百分比，3 = 3% */
  rate: number;
  /** 每期消費上限；null = 無上限 */
  capAmount: number | null;
  resetPeriod: ResetPeriod;
  /** 活動期間（YYYY-MM-DD），選填 */
  validFrom?: string;
  validTo?: string;
  channels: string[];
  note: string;
  /** 同卡同類型多條規則時，數字小的先吃額度 */
  priority: number;
  enabled: boolean;
}

export interface Allocation {
  ruleId: ID;
  spend: number;
  reward: number;
}

export interface Transaction {
  id: ID;
  cardId: ID;
  categoryId: ID;
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
