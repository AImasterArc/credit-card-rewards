import { useRef, useState } from 'react';
import { useData } from '../data';
import { fetchDefaultCardsText, importCardsFromText, importCardsFromXlsx, loadDefaultCards } from '../cardImport';
import { cardsToCsv } from '../lib/cardCsv';

async function saveBlobFile(name: string, blob: Blob): Promise<void> {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') throw e;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveTextFile(name: string, text: string): Promise<void> {
  // 確保具備 UTF-8 BOM，Excel 直接點開才不會變亂碼
  const content = text.startsWith('\uFEFF') ? text : `\uFEFF${text}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  await saveBlobFile(name, blob);
}

/** 空狀態用：一鍵載入隨 App 發佈的預設卡片 */
export function LoadDefaultButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-pill"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        alert(await loadDefaultCards());
        setBusy(false);
      }}
    >
      載入預設卡片
    </button>
  );
}

/** 設定頁：卡片檔匯入 / 範本 / 匯出 */
export function CardFileSection() {
  const { cards, rules, categories } = useData();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <h3 className="section-title">卡片檔（Excel / CSV）</h3>
      <section className="form-group">
        <button className="list-btn" onClick={() => fileRef.current?.click()}>
          <span className="grow">匯入卡片檔（.xlsx 或 .csv）</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) {
              if (f.name.endsWith('.xlsx') || f.type.includes('sheet')) {
                alert(await importCardsFromXlsx(await f.arrayBuffer()));
              } else {
                alert(await importCardsFromText(await f.text()));
              }
            }
          }}
        />
        <button className="list-btn" onClick={async () => alert(await loadDefaultCards())}>
          <span className="grow">載入預設卡片（default-cards.xlsx）</span>
        </button>
        <button
          className="list-btn"
          onClick={async () => {
            try {
              const res = await fetch(`${import.meta.env.BASE_URL}default-cards.xlsx`, { cache: 'no-cache' });
              if (res.ok) {
                const blob = await res.blob();
                await saveBlobFile('default-cards.xlsx', blob);
                return;
              }
            } catch {
              // 忽略並降級下載 CSV
            }
            const text = await fetchDefaultCardsText();
            if (!text) return alert('找不到範本檔');
            await saveTextFile('default-cards.csv', text);
          }}
        >
          <span className="grow">下載填寫範本（default-cards.xlsx）</span>
        </button>
        <button
          className="list-btn"
          disabled={cards.length === 0}
          onClick={() => saveTextFile(`cards-${new Date().toISOString().slice(0, 10)}.csv`, cardsToCsv(cards, rules, categories))}
        >
          <span className="grow">匯出目前卡片為 CSV</span>
        </button>
      </section>
      <p className="hint pad-x">
        支援 Excel (.xlsx) 與 CSV 檔案。匯入時卡片名稱相同會更新該卡並取代其規則，已記的消費會保留並重算。
      </p>
    </>
  );
}
