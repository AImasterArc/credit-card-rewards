import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseCardsCsv, parseCardsXlsx, parseCsv, cardsToCsv, CSV_HEADERS, parseChannelTypes } from './cardCsv';
import type { Card, RewardRule } from '../types';

describe('parseCsv', () => {
  it('strips UTF-8 BOM and ignore comments starting with #', () => {
    const csv = '\uFEFF# this is a comment\n卡片名稱,結帳日\nCUBE,15\n# another comment\nJ卡,5';
    const rows = parseCsv(csv);
    expect(rows.length).toBe(3);
    expect(rows[0].cells).toEqual(['卡片名稱', '結帳日']);
    expect(rows[1].cells).toEqual(['CUBE', '15']);
    expect(rows[2].cells).toEqual(['J卡', '5']);
  });

  it('handles quotes with commas and escaped quotes', () => {
    const csv = '卡片名稱,規則備註\n"國泰, CUBE","說明 ""特別加碼"" 備註"';
    const rows = parseCsv(csv);
    expect(rows[1].cells[0]).toBe('國泰, CUBE');
    expect(rows[1].cells[1]).toBe('說明 "特別加碼" 備註');
  });
});

describe('parseChannelTypes', () => {
  it('parses single and multiple channel types', () => {
    expect(parseChannelTypes('實體')).toEqual(['實體']);
    expect(parseChannelTypes('網路')).toEqual(['網路']);
    expect(parseChannelTypes('行動支付')).toEqual(['行動支付']);
    expect(parseChannelTypes('實體|網路')).toEqual(['實體', '網路']);
    expect(parseChannelTypes('實體、行動支付')).toEqual(['實體', '行動支付']);
    expect(parseChannelTypes('全通路')).toEqual(['實體', '網路', '行動支付']);
    expect(parseChannelTypes('一般消費')).toEqual(['實體', '網路', '行動支付']);
  });
});

describe('parseCardsCsv', () => {
  it('parses 15-column CSV with multi-select channel types', () => {
    const csv = `
# 範例
卡片名稱,銀行,末四碼,結帳日,取整,顏色,卡片備註,通路類型,回饋%,每期消費上限,重置方式,通路,規則備註,活動結束,啟用
CUBE卡,國泰世華,1234,15,四捨五入,#005596,網銀方案,全通路,0.3,,結帳日,,,,是
,,,,,,,實體|網路,3,1000,結帳日,Uber Eats|foodpanda,需切換樂饗購方案,,是
,,,,,,,行動支付,3,,結帳日,LINE Pay,需切換玩數位方案,,是
J卡,富邦,5678,5,捨去,#0284c7,,全通路,1,,自然月,,,,是
,,,,,,,實體,3,5000,自然月,日本實體|韓國實體,,,是
`;
    const res = parseCardsCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.cards.length).toBe(2);

    const cube = res.cards[0];
    expect(cube.name).toBe('CUBE卡');
    expect(cube.bank).toBe('國泰世華');
    expect(cube.last4).toBe('1234');
    expect(cube.statementDay).toBe(15);
    expect(cube.roundingMode).toBe('round');
    expect(cube.color).toBe('#005596');
    expect(cube.rules.length).toBe(3);

    expect(cube.rules[0]).toMatchObject({
      channelTypes: ['實體', '網路', '行動支付'],
      rate: 0.3,
      capAmount: null,
      resetPeriod: 'billing',
      enabled: true,
    });
    expect(cube.rules[1]).toMatchObject({
      channelTypes: ['實體', '網路'],
      rate: 3,
      capAmount: 1000,
      channels: ['Uber Eats', 'foodpanda'],
    });

    const j = res.cards[1];
    expect(j.name).toBe('J卡');
    expect(j.statementDay).toBe(5);
    expect(j.roundingMode).toBe('floor');
    expect(j.rules.length).toBe(2);
    expect(j.rules[1].resetPeriod).toBe('calendarMonth');
  });

  it('supports header aliases (e.g. 卡片, 通路類別, 上限, 回饋率)', () => {
    const csv = `
卡片,結帳日,通路類別,回饋率,上限,適用通路
Sport卡,22,行動支付,7%,5000,Apple Pay|Google Pay
`;
    const res = parseCardsCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.cards.length).toBe(1);
    expect(res.cards[0].name).toBe('Sport卡');
    expect(res.cards[0].rules[0].rate).toBe(7);
    expect(res.cards[0].rules[0].capAmount).toBe(5000);
    expect(res.cards[0].rules[0].channelTypes).toEqual(['行動支付']);
    expect(res.cards[0].rules[0].channels).toEqual(['Apple Pay', 'Google Pay']);
  });

  it('validates missing required headers', () => {
    const csv = '銀行,通路類型,回饋%\n國泰,實體,1';
    const res = parseCardsCsv(csv);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.some((e) => e.includes('卡片名稱'))).toBe(true);
    expect(res.errors.some((e) => e.includes('結帳日'))).toBe(true);
  });

  it('validates invalid statement days', () => {
    const csv = '卡片名稱,結帳日,通路類型,回饋%\n測試卡,35,實體,1';
    const res = parseCardsCsv(csv);
    expect(res.errors.some((e) => e.includes('1–31'))).toBe(true);
  });

  it('validates invalid rate or cap', () => {
    const csv = '卡片名稱,結帳日,通路類型,回饋%,每期消費上限\n測試卡,15,實體,abc,xyz';
    const res = parseCardsCsv(csv);
    expect(res.errors.some((e) => e.includes('回饋%'))).toBe(true);
  });
});

describe('cardsToCsv round-trip', () => {
  it('exports cards and rules into valid 15-column CSV matching headers', () => {
    const cards: Card[] = [
      {
        id: 'c1',
        name: '測試卡',
        bank: '測試銀行',
        last4: '9999',
        color: '#005596',
        statementDay: 15,
        roundingMode: 'floor',
        archived: false,
        sortOrder: 0,
        createdAt: 0,
      },
    ];
    const rules: RewardRule[] = [
      {
        id: 'r1',
        cardId: 'c1',
        channelTypes: ['實體', '網路', '行動支付'],
        rate: 1,
        capAmount: null,
        resetPeriod: 'billing',
        channels: [],
        note: '',
        enabled: true,
      },
      {
        id: 'r2',
        cardId: 'c1',
        channelTypes: ['實體', '網路'],
        rate: 3,
        capAmount: 1000,
        resetPeriod: 'billing',
        channels: ['餐廳A', '餐廳B'],
        note: '滿千適用',
        enabled: true,
      },
    ];

    const exported = cardsToCsv(cards, rules);
    expect(exported.startsWith(CSV_HEADERS.join(','))).toBe(true);
    expect(exported).not.toContain('活動開始');
    expect(exported).not.toContain('優先順序');

    const reimported = parseCardsCsv(exported);
    expect(reimported.errors).toEqual([]);
    expect(reimported.cards.length).toBe(1);
    expect(reimported.cards[0].name).toBe('測試卡');
    expect(reimported.cards[0].rules.length).toBe(2);
    expect(reimported.cards[0].rules[0].channelTypes).toEqual(['實體', '網路']);
    expect(reimported.cards[0].rules[1].channelTypes).toEqual(['實體', '網路', '行動支付']);
    expect(reimported.cards[0].roundingMode).toBe('floor');
  });
});

describe('parseCardsXlsx', () => {
  it('parses default-cards.xlsx and loads all 11 cards with 0 errors', async () => {
    const filePath = path.resolve(__dirname, '../../public/default-cards.xlsx');
    const buf = fs.readFileSync(filePath);
    const res = await parseCardsXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(res.errors).toEqual([]);
    expect(res.cards.length).toBe(11);
    const names = res.cards.map((c) => c.name);
    expect(names).toContain('永豐大戶卡');
    expect(names).toContain('永豐Sport卡');
    expect(names).toContain('星展傳說卡');
    expect(names).toContain('永豐幣倍卡');
    expect(names).toContain('國泰CUBE卡');
    expect(names).toContain('玉山Ubear卡');
    expect(names).toContain('聯邦LINE卡');
    expect(names).toContain('中信中油卡');
    expect(names).toContain('聯邦吉鶴卡');
    expect(names).toContain('星展永續卡');
    expect(names).toContain('星展極簡卡');
  });
});

