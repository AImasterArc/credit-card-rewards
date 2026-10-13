const pad = (n: number): string => String(n).padStart(2, '0');

export const toYmd = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseYmd = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const today = (): string => toYmd(new Date());

/** 建立日期；day 超過當月天數時取當月最後一天。month 可溢位（-1、12…） */
export function clampDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

export function addDays(ymd: string, n: number): string {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

export function diffDays(fromYmd: string, toYmdStr: string): number {
  const ms = parseYmd(toYmdStr).getTime() - parseYmd(fromYmd).getTime();
  return Math.round(ms / 86_400_000);
}

/** 帳單週期 (上次結帳日, 本次結帳日]，回傳包含頭尾的 [start, end] */
export function getBillingCycle(statementDay: number, refYmd: string): [string, string] {
  const ref = parseYmd(refYmd);
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const thisStmt = clampDate(y, m, statementDay);
  const end = ref <= thisStmt ? thisStmt : clampDate(y, m + 1, statementDay);
  const prevEnd = clampDate(end.getFullYear(), end.getMonth() - 1, statementDay);
  return [addDays(toYmd(prevEnd), 1), toYmd(end)];
}

export function getCalendarMonth(refYmd: string): [string, string] {
  const ref = parseYmd(refYmd);
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return [toYmd(start), toYmd(end)];
}

/** 'YYYY-MM' 加減月份 */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const formatYm = (ym: string): string => {
  const [y, m] = ym.split('-');
  return `${y} 年 ${Number(m)} 月`;
};

export const formatMd = (ymd: string): string => {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
export const weekday = (ymd: string): string => WEEKDAYS[parseYmd(ymd).getDay()];
