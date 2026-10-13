const nf = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });

export const money = (n: number): string =>
  Number.isFinite(n) ? `${n < 0 ? '-' : ''}$${nf.format(Math.abs(Math.round(n)))}` : '無上限';

/** 帶正負號：+$3 / -$3 */
export const signedMoney = (n: number): string => (n >= 0 ? `+${money(n)}` : money(n));

export const num = (n: number): string => nf.format(Math.round(n));

export const pct = (n: number, digits = 1): string =>
  `${Number.isInteger(n) ? n : n.toFixed(digits)}%`;

/** 非 secure context（例如區網 http 測試）沒有 crypto.randomUUID */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const CARD_COLORS = [
  '#1c1c1e',
  '#007aff',
  '#34c759',
  '#ff9500',
  '#ff3b30',
  '#af52de',
  '#5856d6',
  '#ff2d55',
  '#a2845e',
  '#30b0c7',
  '#d4af37',
  '#8e8e93',
];
