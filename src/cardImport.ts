import { db, saveCardWithRules } from './db';
import { CARD_COLORS, uid } from './lib/format';
import { parseCardsCsv, parseCardsXlsx, type ParseResult } from './lib/cardCsv';
import type { Card, RewardRule } from './types';
import { CHANNEL_TYPES, CHANNEL_TYPE_COLORS } from './types';

export const DEFAULT_CARDS_CSV = `# 預設信用卡資料檔 (UTF-8 BOM) - 完整填寫指南與表格範例請參閱 deploy-guide.html
卡片名稱,銀行,末四碼,結帳日,取整,顏色,卡片備註,通路類型,回饋%,每期消費上限,重置方式,通路,規則備註,活動結束,啟用
永豐大戶卡,永豐銀行,,5,四捨五入,#1e1e1e,需具備大戶數位帳戶大大/大戶等級與電子帳單,實體|網路,6,25000,結帳日,海外實體|外幣消費,海外與外幣消費享最高 6%,2026-12-31,是
,,,,,,,實體|網路,5,25000,結帳日,全通路(排除超商量販/繳費平台/小額支付/交通儲值/稅款/醫療費/罰款/境外投資),大戶等級全通路指定加碼,2026-12-31,是
,,,,,,,實體,5,10000,結帳日,悠遊卡自動加值,悠遊卡自動加值享 5% (上限 500 元),2026-12-31,是
,,,,,,,實體|網路|行動支付,1,,結帳日,一般消費,國內外一般消費基本 1% 無上限,2026-12-31,是
永豐Sport卡,永豐銀行,,5,捨去,#f97316,"需下載汗水不白流 App 並每月消耗 10,000 大卡達標",實體|網路|行動支付,5,10000,結帳日,Apple Pay|App Store|Steam|藥妝,"汗水 > 10,000 大卡享指定支付/通路 5% 加碼",2026-12-31,是
,,,,,,,實體|網路|行動支付,1,,結帳日,一般消費,一般消費基本 1% 無上限,2026-12-31,是
星展傳說卡,星展銀行,,16,四捨五入,#7c3aed,星展傳說對決聯名卡，指定遊戲影音外送高回饋,實體|網路,10,3333,結帳日,App Store|Steam|NOVA|售票網|外送平台|蝦皮|淘寶|麥當勞|肯德基|影音平台|Twitch,"指定遊戲影音外送享最高 10% (可刷約 3,333 元)",2026-12-31,是
,,,,,,,實體|行動支付,5,12500,結帳日,日本實體|韓國實體|泰國實體|新加坡實體|美洲實體|歐洲實體|海外Apple Pay,限日/韓/泰/新/美/歐實體門市或 Apple Pay,2026-12-31,是
,,,,,,,實體|網路|行動支付,1,,結帳日,一般消費,國內一般消費基本 1% 無上限,2026-12-31,是
永豐幣倍卡,永豐銀行,,5,捨去,#0284c7,需綁定永豐外幣存款帳戶與自動扣繳,網路,6,20000,結帳日,淘寶|iHerb|OliveYoung|Airbnb|Booking.com|旅行社|飯店|航空|Trip.com|KKDAY|Klook,指定國外網購與線上旅遊加碼最高 6%,2026-12-31,是
,,,,,,,實體,6,20000,結帳日,海外實體|日本交通卡儲值|Suica|PASMO,海外實體門市與日本交通卡儲值最高 6%,2026-12-31,是
,,,,,,,實體|網路|行動支付,1,,結帳日,一般消費,國內一般消費基本 1% 無上限,2026-12-31,是
國泰CUBE卡,國泰世華,,3,四捨五入,#005596,每日可於 CUBE App 切換方案，未切換以一般消費計,網路,3.3,,結帳日,App Store|網購|AI工具|Duolingo|Google Play,需切換「玩數位」方案,2026-12-31,是
,,,,,,,實體|網路,3.3,,結帳日,百貨|外送|餐廳|藥妝|Uber Eats|foodpanda|王品,需切換「樂饗購」方案,2026-12-31,是
,,,,,,,實體|網路,3.3,,結帳日,Grab|航空|飯店|旅行社|租車,需切換「趣旅行」方案,2026-12-31,是
,,,,,,,實體,3.3,,結帳日,海外實體消費,需切換「趣旅行」海外實體,2026-12-31,是
,,,,,,,實體,2,,結帳日,超市|中油|7-11|全家|全聯|家樂福,需切換「集精選」方案,2026-12-31,是
,,,,,,,實體|網路|行動支付,0.3,,結帳日,一般消費,基本回饋或未切換方案,2026-12-31,是
玉山Ubear卡,玉山銀行,,3,四捨五入,#e11d48,申辦電子帳單享網購與指定影音娛樂高回饋,網路,10,1000,結帳日,Nintendo|Netflix|Steam|Gemini|Spotify|Disney+,指定娛樂影音 10% (每期上限 100 元),2027-02-28,是
,,,,,,,網路,3,7500,結帳日,國內外線上消費|蝦皮|momo|PChome|酷澎,網購 3% (含基本 1% + 加碼 2%),2027-02-28,是
,,,,,,,實體|網路|行動支付,1,,結帳日,一般消費,國內外一般消費基本 1% 無上限,2027-02-28,是
聯邦LINE卡,聯邦銀行,,3,四捨五入,#06c755,需申辦電子帳單，享指定網購加碼回饋,網路,4,10000,結帳日,momo|PChome|酷澎|淘寶|蝦皮|Steam,指定網購加碼 4% (每期加碼上限 300 元),2027-07-31,是
,,,,,,,實體|網路|行動支付,2,,結帳日,一般消費,國內一般消費 2% 無上限,2027-07-31,是
中信中油卡,中國信託,,5,四捨五入,#0284c7,綁定中油Pay並於指定日線上儲值享最高回饋,行動支付,6.8,,結帳日,中油Pay|台灣中油,週一儲值中油Pay單筆滿3000元最高享6.8%,2026-12-31,是
,,,,,,,實體|網路|行動支付,0.5,,結帳日,一般消費,一般消費基本中信紅利點數,2026-12-31,是
聯邦吉鶴卡,聯邦銀行,,3,四捨五入,#b91c1c,赴日旅遊神卡，日系餐廳與日本品牌享專屬加碼,實體,10,,結帳日,勝博殿|一風堂|欣葉日本料理|頑味食堂|日系餐廳,國內指定日系名店享最高現折/回饋 10%,2026-12-31,是
,,,,,,,實體|網路,5,12500,結帳日,UQ|GU|UNIQLO|GU網路商店|日牌實體店|唐吉訶德|大創|無印良品,"指定日牌門市與官網加碼 5% (可刷 12,500 元)",2026-12-31,是
,,,,,,,實體|網路|行動支付,1.5,,結帳日,一般消費,國內一般消費 1.5% 無上限,2026-12-31,是
星展永續卡,星展銀行,,16,四捨五入,#15803d,星展 eco 永續卡，享指定國家海外實體及 Apple Pay 加碼,實體|行動支付,5,15000,結帳日,日本實體|韓國實體|泰國實體|新加坡實體|美洲實體|歐洲實體|海外Apple Pay,限日/韓/泰/新/美/歐實體門市或 Apple Pay,2026-12-31,是
,,,,,,,實體|網路|行動支付,1.5,,結帳日,一般消費,國內外一般消費 1.5% 現金積點無上限,2026-12-31,是
星展極簡卡,星展銀行,,16,四捨五入,#475569,星展極簡卡，享海外指定國家實體及 Apple Pay 加碼,實體|行動支付,5,15000,結帳日,日本實體|韓國實體|泰國實體|新加坡實體|美洲實體|海外Apple Pay,限日/韓/泰/新/美實體門市或 Apple Pay,2026-12-31,是
,,,,,,,實體|網路|行動支付,1.2,,結帳日,一般消費,基本國內外現金回饋無上限,2026-12-31,是
`;

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * 處理已解析好的卡片清單寫入 Dexie DB
 */
export async function importCardsFromParsed({ cards: parsed, errors }: ParseResult): Promise<string> {
  if (errors.length) {
    const shown = errors.slice(0, 8).join('\n');
    return `檔案有 ${errors.length} 個問題，未匯入任何資料：\n${shown}${errors.length > 8 ? `\n…還有 ${errors.length - 8} 個` : ''}`;
  }

  // 確保 3 種基本通路類型存在於 categories 表中以供系統參考
  const existingCats = await db.categories.toArray();
  for (let i = 0; i < CHANNEL_TYPES.length; i++) {
    const name = CHANNEL_TYPES[i];
    if (!existingCats.some((c) => c.name === name)) {
      await db.categories.add({
        id: name,
        name,
        color: CHANNEL_TYPE_COLORS[name],
        sortOrder: i,
        archived: false,
      });
    }
  }

  const cards = await db.cards.toArray();
  const cardByName = new Map(cards.map((c) => [norm(c.name), c]));

  const updated = parsed.filter((p) => cardByName.has(norm(p.name)));
  const created = parsed.length - updated.length;
  const ruleCount = parsed.reduce((s, p) => s + p.rules.length, 0);

  const lines = [`新增 ${created} 張卡、更新 ${updated.length} 張卡，共 ${ruleCount} 條規則`];
  if (updated.length) lines.push(`同名卡片會被更新，且其原有規則會被取代：${updated.map((p) => p.name).join('、')}`);
  if (typeof confirm === 'function' && !confirm(`${lines.join('\n')}\n\n確定匯入？`)) return '已取消匯入';

  let cardOrder = Math.max(-1, ...cards.map((c) => c.sortOrder));
  for (const p of parsed) {
    const existing = cardByName.get(norm(p.name));
    const card: Card = {
      id: existing?.id ?? uid(),
      name: p.name,
      bank: p.bank,
      last4: p.last4,
      color: p.color ?? existing?.color ?? CARD_COLORS[(cards.length + cardOrder + 1) % CARD_COLORS.length],
      statementDay: p.statementDay,
      roundingMode: p.roundingMode,
      archived: false,
      sortOrder: existing?.sortOrder ?? ++cardOrder,
      note: p.note,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const rules: RewardRule[] = p.rules.map((r) => ({
      id: uid(),
      cardId: card.id,
      channelTypes: r.channelTypes,
      rate: r.rate,
      capAmount: r.capAmount,
      resetPeriod: r.resetPeriod,
      channels: r.channels,
      note: r.note,
      validTo: r.validTo,
      enabled: r.enabled,
    }));
    await saveCardWithRules(card, rules);
  }

  return `匯入完成：新增 ${created} 張、更新 ${updated.length} 張卡片，共 ${ruleCount} 條規則`;
}

/** 從 CSV 文字匯入 */
export async function importCardsFromText(text: string): Promise<string> {
  const result = parseCardsCsv(text);
  return importCardsFromParsed(result);
}

/** 從 Excel (.xlsx) ArrayBuffer / Blob 匯入 */
export async function importCardsFromXlsx(buffer: ArrayBuffer | Blob): Promise<string> {
  const result = await parseCardsXlsx(buffer);
  return importCardsFromParsed(result);
}

/** 讀取隨 App 發佈的 default-cards.csv；找不到時回傳內建預設 */
export async function fetchDefaultCardsText(): Promise<string> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}default-cards.csv`, { cache: 'no-cache' });
    if (res.ok) {
      const text = await res.text();
      if (!text.trimStart().startsWith('<')) return text;
    }
  } catch {
    // 忽略網路錯誤，回傳內建字串
  }
  return DEFAULT_CARDS_CSV;
}

/** 讀取隨 App 發佈的 default-cards.xlsx；失敗時降級讀取 default-cards.csv 或內建預設 */
export async function loadDefaultCards(): Promise<string> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}default-cards.xlsx`, { cache: 'no-cache' });
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const head = new Uint8Array(buffer.slice(0, 4));
      // 0x50 0x4B 0x03 0x04 為 ZIP (.xlsx) 檔案魔術頭
      if (head[0] === 0x50 && head[1] === 0x4b) {
        return await importCardsFromXlsx(buffer);
      }
    }
  } catch {
    // 網路異常或讀取失敗時降級
  }
  const text = await fetchDefaultCardsText();
  return importCardsFromText(text);
}
