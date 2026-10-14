import readXlsxFile from 'read-excel-file/universal';
import type { Card, Category, ChannelType, ResetPeriod, RewardRule, RoundingMode } from '../types';
import { CHANNEL_TYPES } from '../types';

/** 卡片檔欄位（15 個欄位；欄位順序可任意調整） */
export const CSV_HEADERS = [
  '卡片名稱',
  '銀行',
  '末四碼',
  '結帳日',
  '取整',
  '顏色',
  '卡片備註',
  '通路類型',
  '回饋%',
  '每期消費上限',
  '重置方式',
  '通路',
  '規則備註',
  '活動結束',
  '啟用',
] as const;
type Col = (typeof CSV_HEADERS)[number];

export interface ParsedRule {
  channelTypes: ChannelType[];
  rate: number;
  capAmount: number | null;
  resetPeriod: ResetPeriod;
  channels: string[];
  note: string;
  validTo?: string;
  enabled: boolean;
}

export interface ParsedCard {
  name: string;
  bank: string;
  last4: string;
  statementDay: number;
  roundingMode: RoundingMode;
  color?: string;
  note: string;
  rules: ParsedRule[];
}

export interface ParseResult {
  cards: ParsedCard[];
  errors: string[];
}

export type RawCell = string | number | boolean | Date | null | undefined;

interface CsvRow {
  cells: string[];
  /** 該列在檔案中的起始行號（從 1 開始） */
  line: number;
}

/** 標準 CSV 解析：支援引號、引號內換行與逗號、`""` 跳脫、CRLF、UTF-8 BOM；`#` 開頭的行視為註解 */
export function parseCsv(input: string): CsvRow[] {
  const src = input.replace(/^\uFEFF/, '').replace(/^#.*$/gm, '');
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const endRow = (): void => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== '')) rows.push({ cells, line: rowLine });
    cells = [];
    cell = '';
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else cell += ch;
  }
  if (cell !== '' || cells.length) endRow();
  return rows;
}

const TRUE_WORDS = new Set(['是', 'y', 'yes', 'true', '1', '啟用', 'v', '✓']);
const FALSE_WORDS = new Set(['否', 'n', 'no', 'false', '0', '停用', 'x']);

const normDate = (v: RawCell): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).replace(/^@/, '').trim();
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const toNumber = (s: string): number => Number(s.replace(/[,，$＄%％\s元]/g, ''));

export function parseChannelTypes(input: string): ChannelType[] {
  const raw = input.trim();
  if (!raw) return [];
  if (['全通路', '一般', '一般消費', '全部', 'all'].includes(raw)) {
    return ['實體', '網路', '行動支付'];
  }
  const tokens = raw.split(/[|/、,，\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const result = new Set<ChannelType>();
  for (const t of tokens) {
    if (['實體', '實體門市', '門市', 'physical'].includes(t)) result.add('實體');
    else if (['網路', '網購', '線上', '電商', 'online'].includes(t)) result.add('網路');
    else if (['行動支付', '行動', '電子支付', 'mobile', 'mobilepay', 'apple pay', 'line pay', 'google pay'].includes(t)) {
      result.add('行動支付');
    } else if (['全通路', '一般', '一般消費', '全部'].includes(t)) {
      CHANNEL_TYPES.forEach((ct) => result.add(ct));
    }
  }
  return [...result];
}

const HEADER_ALIASES: Record<string, Col> = {
  卡片名稱: '卡片名稱', 卡片: '卡片名稱', 卡名: '卡片名稱', card: '卡片名稱', cardname: '卡片名稱',
  銀行: '銀行', 發卡銀行: '銀行', bank: '銀行',
  末四碼: '末四碼', 卡號末四碼: '末四碼', 末4碼: '末四碼', last4: '末四碼',
  結帳日: '結帳日', '結帳日(日)': '結帳日', 帳單結帳日: '結帳日', 帳單日: '結帳日', statementday: '結帳日',
  取整: '取整', 回饋取整: '取整', 取整方式: '取整', rounding: '取整',
  顏色: '顏色', 卡片顏色: '顏色', color: '顏色',
  卡片備註: '卡片備註', 卡片筆記: '卡片備註', 卡片說明: '卡片備註',
  通路類型: '通路類型', 通路類別: '通路類型', 消費類型: '通路類型', 消費類別: '通路類型', 類型: '通路類型', 類別: '通路類型', channeltype: '通路類型', channeltypes: '通路類型',
  '回饋%': '回饋%', 回饋率: '回饋%', '回饋率%': '回饋%', 回饋: '回饋%', rate: '回饋%',
  每期消費上限: '每期消費上限', 消費上限: '每期消費上限', 上限: '每期消費上限', 每期上限: '每期消費上限', cap: '每期消費上限',
  重置方式: '重置方式', 重置週期: '重置方式', 額度重置: '重置方式', 重置: '重置方式', resetperiod: '重置方式',
  通路: '通路', 指定通路: '通路', 適用通路: '通路', 通路清單: '通路', channels: '通路',
  規則備註: '規則備註', 規則筆記: '規則備註', 限制: '規則備註', 備註: '規則備註', 筆記: '規則備註', note: '規則備註',
  活動結束: '活動結束', 結束日期: '活動結束', 活動結束日: '活動結束', 到期日: '活動結束', validto: '活動結束',
  啟用: '啟用', 是否啟用: '啟用', 狀態: '啟用', enabled: '啟用',
};

export function parseCardsFromRows(rawRows: RawCell[][]): ParseResult {
  const errors: string[] = [];
  const rows = rawRows
    .map((cells, i) => ({ cells, line: i + 1 }))
    .filter(({ cells }) =>
      cells.some((c) => {
        if (c === null || c === undefined) return false;
        if (typeof c === 'string') return c.trim() !== '' && !c.trim().startsWith('#');
        return true;
      }),
    );
  if (rows.length === 0) return { cards: [], errors: ['檔案是空的'] };

  let headerRowIdx = -1;
  const idx = {} as Record<Col, number>;
  for (const col of CSV_HEADERS) idx[col] = -1;

  for (let r = 0; r < rows.length; r++) {
    const candidate = rows[r].cells.map((c) => (c !== null && c !== undefined ? String(c).trim().toLowerCase() : ''));
    candidate.forEach((h, i) => {
      const canonical = HEADER_ALIASES[h];
      if (canonical && idx[canonical] === -1) {
        idx[canonical] = i;
      }
    });
    if (idx['卡片名稱'] >= 0 && idx['結帳日'] >= 0) {
      headerRowIdx = r;
      break;
    } else {
      for (const col of CSV_HEADERS) idx[col] = -1;
    }
  }

  if (headerRowIdx === -1) {
    for (const required of ['卡片名稱', '結帳日'] as const) {
      if (idx[required] < 0) errors.push(`標題列缺少必要欄位「${required}」`);
    }
    return { cards: [], errors };
  }

  const cards: ParsedCard[] = [];
  const byName = new Map<string, ParsedCard>();
  let current: ParsedCard | undefined;

  for (const { cells, line } of rows.slice(headerRowIdx + 1)) {
    const getRaw = (col: Col): RawCell => (idx[col] >= 0 ? cells[idx[col]] : undefined);
    const get = (col: Col): string => {
      const v = getRaw(col);
      if (v === null || v === undefined) return '';
      if (v instanceof Date) return normDate(v) ?? '';
      if (col === '回饋%' && typeof v === 'number') {
        if (v > 0 && v < 1) return String(Number((v * 100).toFixed(4)));
        return String(v);
      }
      return String(v).trim();
    };
    const err = (msg: string): void => {
      errors.push(`第 ${line} 行：${msg}`);
    };

    const name = get('卡片名稱');
    if (name) {
      const key = name.toLowerCase();
      current = byName.get(key);
      if (!current) {
        const day = toNumber(get('結帳日'));
        if (!get('結帳日') || !Number.isInteger(day) || day < 1 || day > 31) {
          err(`「${name}」的結帳日必須是 1–31 的整數（目前：${get('結帳日') || '空白'}）`);
          current = undefined;
          continue;
        }
        const roundText = get('取整').toLowerCase();
        let roundingMode: RoundingMode = 'round';
        if (['捨去', '無條件捨去', 'floor'].includes(roundText)) roundingMode = 'floor';
        else if (roundText && !['四捨五入', 'round'].includes(roundText)) {
          err(`取整只能填「四捨五入」或「捨去」（目前：${get('取整')}）`);
        }
        const color = get('顏色');
        if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) err(`顏色必須是 #RRGGBB 格式（目前：${color}）`);
        current = {
          name,
          bank: get('銀行'),
          last4: get('末四碼').replace(/\D/g, '').slice(0, 4),
          statementDay: day,
          roundingMode,
          color: /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : undefined,
          note: get('卡片備註'),
          rules: [],
        };
        byName.set(key, current);
        cards.push(current);
      }
    } else if (!current) {
      err('缺少卡片名稱（只有同一張卡的後續列可以留空）');
      continue;
    }

    const channelTypeText = get('通路類型');
    const ruleFields: Col[] = ['回饋%', '每期消費上限', '通路', '規則備註', '活動結束'];
    if (!channelTypeText) {
      if (ruleFields.some((f) => get(f))) err('有填回饋資料但缺少「通路類型」');
      continue;
    }

    const channelTypes = parseChannelTypes(channelTypeText);
    if (channelTypes.length === 0) {
      err(`「${channelTypeText}」無法辨識為通路類型（請填 實體、網路、行動支付，可使用 | 複選，或填 全通路）`);
      continue;
    }

    const rate = toNumber(get('回饋%'));
    if (!get('回饋%') || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      err(`「${channelTypeText}」的回饋%必須是 0–100 的數字（目前：${get('回饋%') || '空白'}）`);
      continue;
    }

    const capText = get('每期消費上限');
    let capAmount: number | null = null;
    if (capText && !['無', '無上限', '-', '∞'].includes(capText)) {
      capAmount = toNumber(capText);
      if (!Number.isFinite(capAmount) || capAmount < 0) {
        err(`「${channelTypeText}」的每期消費上限必須是數字或留空（目前：${capText}）`);
        continue;
      }
    }

    const resetText = get('重置方式').toLowerCase();
    let resetPeriod: ResetPeriod = 'billing';
    if (['自然月', '每月1日', '每月 1 日', 'calendarmonth'].includes(resetText)) resetPeriod = 'calendarMonth';
    else if (resetText && !['結帳日', '依結帳日', '依卡片結帳日', 'billing'].includes(resetText)) {
      err(`重置方式只能填「結帳日」或「自然月」（目前：${get('重置方式')}）`);
    }

    let validTo: string | undefined;
    if (get('活動結束')) {
      const d = normDate(getRaw('活動結束'));
      if (!d) err(`活動結束必須是 YYYY-MM-DD（目前：${get('活動結束')}）`);
      else validTo = d;
    }

    const enabledText = get('啟用').toLowerCase();
    let enabled = true;
    if (enabledText) {
      if (FALSE_WORDS.has(enabledText)) enabled = false;
      else if (!TRUE_WORDS.has(enabledText)) err(`啟用只能填「是」或「否」（目前：${get('啟用')}）`);
    }

    current!.rules.push({
      channelTypes,
      rate,
      capAmount,
      resetPeriod,
      channels: [...new Set(get('通路').split(/[|｜、,，;；\n]/).map((s) => s.trim()).filter(Boolean))],
      note: get('規則備註'),
      validTo,
      enabled,
    });
  }

  if (cards.length === 0 && errors.length === 0) errors.push('檔案內沒有任何卡片資料列');
  return { cards, errors };
}

export function parseCardsCsv(text: string): ParseResult {
  const rows = parseCsv(text);
  return parseCardsFromRows(rows.map((r) => r.cells));
}

export async function parseCardsXlsx(fileOrBuffer: ArrayBuffer | Blob): Promise<ParseResult> {
  try {
    const res = await readXlsxFile(fileOrBuffer as unknown as Blob);
    const data = (Array.isArray(res) && res.length > 0 && 'data' in res[0] ? (res[0] as { data: RawCell[][] }).data : res) as RawCell[][];
    return parseCardsFromRows(data);
  } catch (e) {
    return { cards: [], errors: [`Excel 檔案讀取失敗：${(e as Error).message}`] };
  }
}

const esc = (v: string | number): string => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 把目前的卡片與規則匯出成可再匯入的 15 欄位 CSV */
export function cardsToCsv(
  cards: readonly Card[],
  rules: readonly RewardRule[],
  _categories?: readonly Category[],
): string {
  const lines: string[] = [CSV_HEADERS.join(',')];
  for (const card of cards.filter((c) => !c.archived)) {
    const cardRules = rules
      .filter((r) => r.cardId === card.id)
      .sort((a, b) => b.rate - a.rate);
    const list: (RewardRule | undefined)[] = cardRules.length ? cardRules : [undefined];
    list.forEach((r, i) => {
      const first = i === 0;
      const typeStr = r
        ? r.channelTypes?.length === 3
          ? '實體|網路|行動支付'
          : (r.channelTypes ?? ['實體']).join('|')
        : '';
      lines.push(
        [
          first ? card.name : '',
          first ? card.bank : '',
          first ? (card.last4 ?? '') : '',
          first ? card.statementDay : '',
          first ? (card.roundingMode === 'floor' ? '捨去' : '四捨五入') : '',
          first ? card.color : '',
          first ? (card.note ?? '') : '',
          typeStr,
          r ? r.rate : '',
          r ? (r.capAmount ?? '') : '',
          r ? (r.resetPeriod === 'calendarMonth' ? '自然月' : '結帳日') : '',
          r ? r.channels.join('|') : '',
          r ? r.note : '',
          r?.validTo ?? '',
          r ? (r.enabled ? '是' : '否') : '',
        ]
          .map(esc)
          .join(','),
      );
    });
  }
  return lines.join('\r\n') + '\r\n';
}
