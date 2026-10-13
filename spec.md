# 信用卡回饋記錄 App — 功能規格 v0.1

> 技術：PWA（Vite + React + TS）+ IndexedDB（Dexie），單機優先，之後可接 Supabase 同步。

---

## 0. 核心設計原則

1. **「重置」是算出來的，不會刪資料**：已用額度 = 篩選「目前週期內」的交易再加總。結帳日一過，週期區間自動變成新的區間，額度就回滿。歷史交易永遠保留，可以回頭查任何一期。
2. **類型（Category）是獨立的資料表**，卡片的回饋規則用 `categoryId` 關聯，不存字串。
3. **上限分兩種**：「消費金額上限」（刷滿 X 元）跟「回饋金額上限」（最多回 Y 元），兩種都要支援，因為銀行兩種寫法都有。

---

## 1. 資料模型

```ts
// 消費類型（可以自己擴增）
interface Category {
  id: string;
  name: string;          // 一般消費、指定通路、國外消費、行動支付、網購…
  color: string;         // Bar 顏色
  icon?: string;
  sortOrder: number;
  archived: boolean;     // 被規則用到的類型只能封存，不能硬刪
}

interface Card {
  id: string;
  name: string;          // 例：國泰 CUBE
  bank: string;
  last4?: string;
  color: string;
  statementDay: number;  // 1–31；遇到當月沒有這天（29–31）就用當月最後一天
  rewardUnit: 'cash' | 'points' | 'miles';
  pointValue: number;    // 1 點 = 多少元，cash 就是 1；推薦排序統一換算成元
  roundingMode: 'floor' | 'round' | 'ceil'; // 每筆回饋怎麼取整
  archived: boolean;
  sortOrder: number;
  note?: string;
}

interface RewardRule {
  id: string;
  cardId: string;
  categoryId: string;
  rate: number;                 // 0.03 = 3%
  isBase: boolean;              // 基本回饋：這張卡所有消費都適用，可以跟其他規則疊加
  capType: 'spend' | 'reward' | 'none';
  capAmount?: number;           // spend：最多刷 X 元；reward：最多回 Y 元
  resetPeriod: 'billing' | 'calendarMonth' | 'campaign' | 'none';
  validFrom?: string;           // 活動期間（ISO date），resetPeriod = campaign 時必填
  validTo?: string;
  minSpend?: number;            // 當期滿額門檻（v2）
  channels: string[];           // 對應通路標籤：['全聯', '家樂福', 'Uber Eats']
  note?: string;                // 其他限制，例：需登錄、排除超商代收
  priority: number;             // 同類型多條規則時，先用 priority 小的
  enabled: boolean;
}

interface Transaction {
  id: string;
  cardId: string;
  categoryId: string;
  amount: number;               // 負數 = 退款，會回補額度
  date: string;                 // 消費日（ISO）
  channel?: string;             // 實際通路
  note?: string;
  // 存檔當下的計算快照：規則之後被改，歷史資料也不會跟著變
  allocations: { ruleId: string; spend: number; reward: number }[];
  createdAt: string;
}
```

Dexie schema：

```ts
this.version(1).stores({
  categories: 'id, sortOrder, archived',
  cards: 'id, sortOrder, archived',
  rules: 'id, cardId, categoryId, enabled',
  txns: 'id, cardId, categoryId, date, [cardId+date]',
});
```

---

## 2. 週期計算

週期定義：`(上次結帳日, 本次結帳日]`，結帳日當天的消費算本期。

```ts
function clampDay(y: number, m: number, d: number): Date {
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d, last));
}

/** 回傳 [start, end]，包含頭尾，以本地日期計算 */
export function getBillingCycle(statementDay: number, ref = new Date()): [Date, Date] {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const thisStmt = clampDay(y, m, statementDay);
  const end = ref <= thisStmt ? thisStmt : clampDay(y, m + 1, statementDay);
  const prevEnd = clampDay(end.getFullYear(), end.getMonth() - 1, statementDay);
  const start = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1);
  return [start, end];
}

export function getRulePeriod(rule: RewardRule, card: Card, ref = new Date()): [Date, Date] | null {
  switch (rule.resetPeriod) {
    case 'billing': return getBillingCycle(card.statementDay, ref);
    case 'calendarMonth': return [new Date(ref.getFullYear(), ref.getMonth(), 1), new Date(ref.getFullYear(), ref.getMonth() + 1, 0)];
    case 'campaign': return [new Date(rule.validFrom!), new Date(rule.validTo!)];
    case 'none': return null; // 不限期
  }
}
```

剩餘額度：

```ts
remaining(rule) =
  capType === 'spend'  ? capAmount - Σ allocations[rule].spend   （當期）
  capType === 'reward' ? capAmount - Σ allocations[rule].reward  （當期）
  capType === 'none'   ? Infinity
```

> [!NOTE]
> 銀行實際上是看「入帳日」，不是消費日。跨結帳日的消費可能被算到下一期。MVP 先用消費日，交易表單提供「手動指定歸屬週期」當作修正手段。

---

## 3. 推薦演算法（新增消費時）

輸入：`categoryId`、`amount`（沒填金額就用 1000 試算）、`channel?`（選填）

```
對每張未封存的卡片 card：
  rules = 這張卡已啟用、在有效期內，且 (categoryId 符合 或 isBase) 的規則，依 priority 排序
  left = amount
  對每條非 base 的規則 r：
    可用 = min(left, r 換算成消費金額的剩餘額度)
    reward += 可用 × r.rate
    left -= 可用
  base 規則：整筆 amount（或規則設定的部分）× base.rate   // 疊加
  estReward = Σ reward 換算成元 (× pointValue)，再依 roundingMode 取整
  effectiveRate = estReward / amount
  若沒有任何 categoryId 符合的規則仍有剩餘額度 → 標記「已達上限」，只算 base 回饋

排序：estReward ↓ → 剩餘額度 ↓（保留額度大的卡）→ card.sortOrder
```

- 結果卡片顯示：**卡名、預估回饋、實際回饋率、剩餘額度、命中規則的通路 chips + 筆記**，讓你自己確認
- 預設選第 1 名，點其他卡可以改選
- 有填 `channel` 時：命中 `channels` 的規則加上 ✅ 標記；**完全沒命中的指定類型規則降級顯示**，避免「類型對了但通路不對」
- 如果一筆金額會超過上限，顯示拆分：`前 1,200 元 @3%，剩下 800 元 @0.5%`

---

## 4. 畫面規格

底部 Tab：**總覽｜紀錄｜卡片庫｜設定**，中間浮一顆 `+`

### 4.1 總覽（開啟 App 的預設畫面）
- 每張卡一個區塊：卡名、色條、**本期區間 + 距離重置還有 N 天**
- 每條有上限的規則一條 Bar：
  - 顏色 = Category 顏色
  - 標示 `類型名 3%`、`已刷 3,200 / 5,000`、**剩餘 1,800**
  - ≥80% 顯示黃色、100% 顯示灰色並標「已滿」
- 卡片區塊的頂部顯示本期累計回饋（元）
- 頂部摘要：本月總回饋、本月總消費
- 卡片排序：可以拖曳，或選「剩餘額度多的排前面」

### 4.2 新增消費（點 `+` → Bottom Sheet）
步驟一頁完成，由上到下：
1. **類型**：Category chips（橫向捲動），必選
2. **金額**：數字鍵盤，自動 focus
3. **通路**（選填）：輸入時從所有規則的 `channels` 自動完成；**選了通路會反推類型**
4. **推薦清單**：即時計算（§3），顯示通路 + 筆記
5. **卡片**：預設帶推薦第 1 名，可改
6. 日期（預設今天）、備註
7. 儲存 → 寫入 `allocations` 快照 → 回到總覽，Bar 更新

### 4.3 卡片庫
- 卡片列表 → 點進卡片編輯頁
- 卡片欄位：名稱、銀行、末四碼、顏色、結帳日（1–31 選單）、回饋單位、點數價值、取整方式、備註
- **回饋規則清單**（同一張卡可以有多條），每條：
  - 類型（下拉選單，來源是 Category 表，選單最後一項是「＋新增類型」）
  - 回饋 %、上限類型 + 金額、重置週期、活動期間
  - 通路（tag 輸入，可以多個）、筆記
  - 是否為基本回饋、啟用開關
- 規則可以複製（同一張卡不同類型通常只改 % 跟通路）
- 刪除卡片 = 封存（保留歷史交易）

### 4.4 類型管理（設定 → 消費類型）
- 新增 / 改名 / 改顏色 / 拖曳排序 / 封存
- 預設種子資料：一般消費、指定通路、國外消費、行動支付、網購、餐飲、交通、保費、繳稅

### 4.5 紀錄
- 依週期 / 月份分組，可以篩選卡片、類型
- 左滑編輯、刪除；**編輯後要重新計算該筆跟同週期之後的 allocations**（因為額度是依序吃掉的）

### 4.6 設定
- 匯出 / 匯入 JSON（Web Share API 存到 iCloud Drive）
- 上次備份時間，超過 7 天就提醒
- 深色模式（跟隨系統）
- `navigator.storage.persist()` 狀態顯示

---

## 5. 建議加的功能

| 優先 | 功能 | 原因 |
|---|---|---|
| MVP | **通路反查**：輸入「全聯」→ 列出所有卡的相關規則 | 結帳前最常用的就是這個，比先選類型更直覺 |
| MVP | **退款**（負數金額）回補額度 | 不然退貨後額度永遠是錯的 |
| MVP | **JSON 備份 / 還原** | PWA 資料唯一的保險 |
| MVP | 規則有效期限 + 到期前 7 天提醒 | 活動加碼大多只有一季 |
| v2 | 滿額門檻 `minSpend`（當期刷滿 X 才有加碼） | 總覽顯示「再刷 N 元解鎖」 |
| v2 | 需要登錄的活動加上「已登錄」勾選 | 很多加碼要手動登錄，忘記就沒有 |
| v2 | 年費減免追蹤（年度消費 N 元 / N 筆） | 每張卡另外一條進度 Bar |
| v2 | 回饋入帳核對：手動填實際入帳回饋，跟預估比對 | 抓出被排除的交易 |
| v2 | 統計頁：各卡 / 各類型 月回饋折線圖 | |
| v2 | 銀行規則模板：匯入 JSON 一鍵建好整張卡 | 分享給朋友用 |
| v3 | Supabase 同步、多裝置 | |
| v3 | 捷徑整合：URL scheme `?add&cat=xx&amt=yy`，搭配 iOS 自動化（例如 Apple Pay 交易觸發）快速記帳 | iOS 捷徑有「錢包交易」觸發器，可以做到刷完自動跳出記帳 |

---

## 6. 邊界案例

- 結帳日 29–31 → 用當月最後一天（`clampDay`）
- 規則被修改 → 舊交易依 `allocations` 快照，不重算；提供「用新規則重算本期」按鈕
- 規則 / 卡片被刪 → 一律軟刪除（archived）
- 同一筆消費同時命中「指定 3%」跟「基本 0.5%」→ 依 `isBase` 決定要疊加還是二選一（**待確認，見下方**）
- 時區：一律用本地日期字串 `YYYY-MM-DD` 比對，不用 UTC timestamp

---

## 7. 待決定

1. **疊加邏輯**：多數卡是「基本 + 加碼」疊加（例：國外 1% + 加碼 2% = 3%），也有卡是「指定 3% 取代基本 1%」。目前設計用 `isBase` 表示疊加；如果是取代型，就把基本回饋建成一般規則就好。這樣夠用嗎？
2. **上限**：要不要同時支援「回饋上限」跟「消費上限」？還是你手上的卡都只寫消費上限？
3. **點數 / 哩程卡**：需要換算成元一起比較嗎？

回覆:
- 回饋怎麼合併? 指定回饋直接取代基本回饋，不用支援複合類型
- 上限種類支援消費上限就好
- 不用哩程卡，都以現金回饋來看就好
- 再多一個功能是可以透過修改程式來 Default 設定卡片

另外記錄是以月為單位，可以一目了然看當月或是之前幾個月的消費狀況跟回饋的各項與總金額
你了解這些後，就可以開始把專案完整建立好了；將功能開發好後，最後再建立一個 html 文件教我如何部署到 Github 上讓我在 iPhone 16 Pro (記得在開發時要最符合這台手機的比例) 上可以做使用

