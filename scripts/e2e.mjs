// 端對端冒煙測試：iPhone 16 Pro 視窗 (402×874, DPR 3)
// 用法：先 `npm run build && npm run preview -- --port 4173`，再 `node scripts/e2e.mjs`
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.E2E_URL ?? 'http://localhost:4173/';
const SHOTS = process.env.E2E_SHOTS ?? 'e2e-shots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const poll = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-TW',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const tab = (label) => page.locator('.tab', { hasText: label }).click();

await page.goto(URL);
await page.waitForSelector('.tab-bar');

// 1. 無水平溢出
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('首頁無水平溢出', overflow <= 0, `overflow=${overflow}`);
check('空狀態顯示', await page.getByText('還沒有卡片').isVisible());
await shot('01-empty');

// 2. 新增卡片
await tab('卡片庫');
await page.getByRole('button', { name: /新增第一張卡|新增卡片/ }).first().click();
await page.getByPlaceholder('例：CUBE 卡').fill('測試卡');
await page.getByPlaceholder('例：國泰世華').fill('測試銀行');
await page.locator('select.input-plain').selectOption('15');

// 一般消費規則
await page.getByRole('button', { name: '新增規則' }).click();
await page.locator('.sheet input[inputmode="decimal"]').fill('0.5');
await page.getByRole('button', { name: '完成' }).click();

// 指定消費規則：新增類型「餐飲」已在種子內，直接選
await page.getByRole('button', { name: '新增規則' }).click();
await page.locator('.sheet select').first().selectOption({ label: '餐飲' });
await page.locator('.sheet input[inputmode="decimal"]').fill('3');
await page.locator('.sheet input[inputmode="numeric"]').first().fill('1000');
await page.getByPlaceholder('輸入後按 Enter，可用逗號一次加多個').fill('麥當勞, 肯德基');
await page.keyboard.press('Enter');
await page.locator('.sheet textarea').fill('需登錄活動');
await shot('02-rule-sheet');
await page.getByRole('button', { name: '完成' }).click();
check('規則列表顯示 2 條', (await page.locator('.rule-item').count()) === 2);
await shot('03-card-editor');
await page.getByRole('button', { name: '儲存' }).click();
check('卡片庫顯示卡片', await poll(() => page.locator('.list-row', { hasText: '測試卡' }).isVisible()));

// 3. 於卡片庫新增類型（RuleSheet 內聯新增）
await page.locator('.list-row', { hasText: '測試卡' }).click();
await page.getByRole('button', { name: '新增規則' }).click();
await page.locator('.sheet select').first().selectOption('__new__');
await page.getByPlaceholder('新類型名稱').fill('加油');
await page.getByRole('button', { name: '新增', exact: true }).click();
let selected = '';
check('內聯新增類型後自動選取', await poll(async () => { selected = await page.locator('.sheet select').first().evaluate((el) => el.selectedOptions[0]?.textContent ?? ''); return selected === '加油'; }), selected);
await page.locator('.sheet-header .btn-text').click(); // 取消規則
await page.locator('.nav-bar .btn-text').first().click(); // 返回

// 4. 通路反查
await page.getByPlaceholder('輸入通路，例：全聯').fill('麥當');
check('通路反查命中', await page.locator('.panel', { hasText: '通路反查' }).getByText('3%').isVisible());
await shot('04-lookup');

// 5. 新增消費
await page.locator('.fab').click();
await page.locator('.chip', { hasText: '餐飲' }).click();
await page.locator('.amount-input').fill('800');
await page.waitForSelector('.rec');
check('推薦顯示通路 chips', await page.locator('.sheet .rec .tag', { hasText: '麥當勞' }).isVisible());
check('推薦顯示筆記', await page.locator('.sheet .rec-note', { hasText: '需登錄活動' }).isVisible());
check('預估回饋 $24', await page.locator('.rec-reward b').first().innerText() === '$24');
await shot('05-add-txn');
await page.getByRole('button', { name: '記一筆' }).click();

// 6. 總覽 Bar
await tab('總覽');
await page.waitForSelector('.card-block');
const remaining = await page.locator('.rule-remaining', { hasText: '剩' }).first().innerText();
check('總覽剩餘額度 $200', remaining.includes('200'), remaining);
check('Bar 存在', (await page.locator('.bar-fill').count()) >= 1);
await shot('06-dashboard');

// 7. 超過上限自動切一般消費
await page.locator('.fab').click();
await page.locator('.chip', { hasText: '餐飲' }).click();
await page.locator('.amount-input').fill('500');
await page.waitForSelector('.rec-split');
const split = await page.locator('.rec-split').innerText();
check('拆分顯示', split.includes('@3%') && split.includes('@0.5%'), split);
await page.getByRole('button', { name: '記一筆' }).click();

// 8. 退款
await page.locator('.fab').click();
await page.locator('.chip', { hasText: '餐飲' }).click();
await page.locator('.amount-input').fill('100');
await page.getByRole('button', { name: '退款' }).click();
await page.getByRole('button', { name: '記一筆' }).click();

// 9. 紀錄頁
await tab('紀錄');
await page.waitForSelector('.txn-row');
check('紀錄 3 筆', (await page.locator('.txn-row').count()) === 3);
check('月份標題', (await page.locator('.month-label').innerText()).includes('年'));
await shot('07-records');

check('退款回饋符號正確', !(await page.locator('.txn-amount').allInnerTexts()).join('').includes('+-'));

// 10. 切上個月 → 空
await page.locator('.month-switch .icon-btn').first().click();
check('上個月為空', await page.getByText('這個月沒有消費紀錄').isVisible());
await page.locator('.month-label').click();

// 11. 編輯 & 刪除
await page.locator('.txn-row').first().click();
page.once('dialog', (d) => d.accept());
await page.locator('.sheet-footer .btn-danger').click();
await page.waitForTimeout(300);
check('刪除後剩 2 筆', (await page.locator('.txn-row').count()) === 2);

// 12. 設定 & 類型管理
await tab('設定');
await page.getByPlaceholder('新增類型名稱').fill('旅遊');
await page.getByRole('button', { name: '新增', exact: true }).click();
check('設定新增類型', (await page.locator('.cat-row input[class*=input-plain]').evaluateAll((els) => els.some((e) => e.value === '旅遊'))));
await shot('08-settings');

// 12b. 匯出 → 清除 → 匯入 往返
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /匯出備份/ }).click()]);
const backupPath = `${SHOTS}/backup.json`;
await download.saveAs(backupPath);
check('匯出檔名', /cc-rewards-.*\.json/.test(download.suggestedFilename()), download.suggestedFilename());
page.on('dialog', (d) => d.accept());
await page.getByRole('button', { name: '清除所有資料' }).click();
await page.waitForTimeout(400);
await tab('紀錄');
check('清除後無紀錄', await poll(() => page.getByText('這個月沒有消費紀錄').isVisible()));
await tab('設定');
await page.locator('input[type=file]').setInputFiles(backupPath);
await tab('紀錄');
check('匯入後紀錄還原', await poll(async () => (await page.locator('.txn-row').count()) === 2, 4000));

// 13. 重新整理後資料仍在
await page.reload();
await page.waitForSelector('.tab-bar');
await tab('紀錄');
await page.waitForSelector('.txn-row');
check('重新整理後資料保留', (await page.locator('.txn-row').count()) === 2);

// 14. 離線
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload();
check('離線可開啟', await page.locator('.tab-bar').isVisible());
await ctx.setOffline(false);

// 15. 深色模式
await page.emulateMedia({ colorScheme: 'dark' });
await tab('總覽');
await shot('09-dark');

check('無 console / page 錯誤', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);


