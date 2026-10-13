import { useEffect, useRef, useState } from 'react';
import { useData } from '../data';
import { db, exportBackup, importBackup, isBackupFile, resetAll } from '../db';
import { GENERAL_CATEGORY_ID } from '../lib/rewards';
import { uid } from '../lib/format';
import { Icon } from '../components/ui';
import type { Category } from '../types';

const LAST_BACKUP_KEY = 'cc-rewards:lastBackup';
const BACKUP_REMIND_DAYS = 7;
const PALETTE = ['#8e8e93', '#ff9500', '#007aff', '#34c759', '#af52de', '#ff2d55', '#5ac8fa', '#a2845e', '#ffcc00', '#5856d6', '#30b0c7', '#ff3b30'];

const getLastBackup = (): number | null => {
  const v = localStorage.getItem(LAST_BACKUP_KEY);
  return v ? Number(v) : null;
};

async function shareBackup(): Promise<void> {
  const data = await exportBackup();
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File([JSON.stringify(data)], `cc-rewards-${stamp}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '刷卡回饋備份' });
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
      throw e;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
}

export function BackupReminder() {
  const { txns } = useData();
  const [, force] = useState(0);
  const last = getLastBackup();
  const stale = txns.length > 0 && (!last || Date.now() - last > BACKUP_REMIND_DAYS * 86_400_000);
  if (!stale) return null;
  return (
    <div className="banner">
      <span className="grow">{last ? `已超過 ${BACKUP_REMIND_DAYS} 天沒有備份` : '尚未備份過資料'}</span>
      <button
        className="btn-pill"
        onClick={async () => {
          await shareBackup();
          force((n) => n + 1);
        }}
      >
        立即備份
      </button>
    </div>
  );
}

export function Settings() {
  const { categories, cards, rules, txns } = useData();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [lastBackup, setLastBackup] = useState(getLastBackup());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const requestPersist = async (): Promise<void> => {
    const ok = (await navigator.storage?.persist?.()) ?? false;
    setPersisted(ok);
    if (!ok) alert('瀏覽器未授予持久化儲存。請確認已「加入主畫面」並從主畫面開啟。');
  };

  const onExport = async (): Promise<void> => {
    await shareBackup();
    setLastBackup(getLastBackup());
  };

  const onImport = async (file: File): Promise<void> => {
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!isBackupFile(data)) throw new Error('格式不符');
      if (!confirm(`匯入將覆蓋目前所有資料：\n${data.cards.length} 張卡、${data.rules.length} 條規則、${data.txns.length} 筆消費。\n確定？`)) return;
      await importBackup(data);
      alert('匯入完成');
    } catch (e) {
      alert(`匯入失敗：${(e as Error).message}`);
    }
  };

  const onReset = async (): Promise<void> => {
    if (!confirm('清除所有卡片、規則與消費紀錄？')) return;
    if (!confirm('真的確定？建議先匯出備份。')) return;
    await resetAll();
  };

  const usage = (catId: string): number => rules.filter((r) => r.categoryId === catId).length + txns.filter((t) => t.categoryId === catId).length;

  return (
    <>
      <header className="page-header">
        <h1>設定</h1>
      </header>

      <h3 className="section-title">消費類型</h3>
      <CategoryManager categories={categories} usage={usage} />

      <h3 className="section-title">資料備份</h3>
      <section className="form-group">
        <button className="list-btn" onClick={onExport}>
          <span className="grow">匯出備份（JSON）</span>
          <span className="muted small">{lastBackup ? new Date(lastBackup).toLocaleDateString('zh-TW') : '從未備份'}</span>
        </button>
        <button className="list-btn" onClick={() => fileRef.current?.click()}>
          <span className="grow">從備份匯入</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = '';
          }}
        />
        <div className="list-btn">
          <span className="grow">持久化儲存</span>
          {persisted ? (
            <span className="accent small">已啟用</span>
          ) : (
            <button className="btn-pill" onClick={requestPersist}>
              啟用
            </button>
          )}
        </div>
      </section>
      <p className="hint pad-x">
        資料只存在這台 iPhone 的 App 內。從主畫面刪除 App 會一併刪除資料，請定期匯出備份到 iCloud Drive。
      </p>

      <h3 className="section-title">統計</h3>
      <section className="form-group">
        <div className="list-btn">
          <span className="grow">卡片 / 規則 / 消費</span>
          <span className="muted small">
            {cards.length} / {rules.length} / {txns.length}
          </span>
        </div>
      </section>

      <section className="form-group">
        <button className="danger-row danger" onClick={onReset}>
          清除所有資料
        </button>
      </section>
      <p className="hint center">v{__APP_VERSION__}</p>
    </>
  );
}

function CategoryManager({ categories, usage }: { categories: Category[]; usage: (id: string) => number }) {
  const [newName, setNewName] = useState('');
  const visible = categories;

  const move = async (index: number, dir: -1 | 1): Promise<void> => {
    const target = index + dir;
    if (target < 0 || target >= visible.length) return;
    const a = visible[index];
    const b = visible[target];
    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(a.id, { sortOrder: b.sortOrder });
      await db.categories.update(b.id, { sortOrder: a.sortOrder });
    });
  };

  const add = async (): Promise<void> => {
    const name = newName.trim();
    if (!name) return;
    await db.categories.add({
      id: uid(),
      name,
      color: PALETTE[categories.length % PALETTE.length],
      sortOrder: Math.max(0, ...categories.map((c) => c.sortOrder)) + 1,
      archived: false,
    });
    setNewName('');
  };

  const remove = async (c: Category): Promise<void> => {
    if (usage(c.id) > 0) {
      await db.categories.update(c.id, { archived: !c.archived });
      return;
    }
    if (confirm(`刪除類型「${c.name}」？`)) await db.categories.delete(c.id);
  };

  const cycleColor = async (c: Category): Promise<void> => {
    const i = PALETTE.indexOf(c.color);
    await db.categories.update(c.id, { color: PALETTE[(i + 1) % PALETTE.length] });
  };

  return (
    <section className="form-group">
      {visible.map((c, i) => (
        <div className={`cat-row ${c.archived ? 'dim' : ''}`} key={c.id}>
          <button className="swatch sm" style={{ background: c.color }} onClick={() => cycleColor(c)} aria-label="換顏色" />
          <input
            className="input-plain grow"
            defaultValue={c.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== c.name) void db.categories.update(c.id, { name: v });
              else e.target.value = c.name;
            }}
          />
          <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上移">
            <Icon name="up" size={18} />
          </button>
          <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === visible.length - 1} aria-label="下移">
            <Icon name="down" size={18} />
          </button>
          {c.id === GENERAL_CATEGORY_ID ? (
            <span className="tag">預設</span>
          ) : (
            <button className="btn-text small" onClick={() => remove(c)}>
              {usage(c.id) > 0 ? (c.archived ? '還原' : '封存') : '刪除'}
            </button>
          )}
        </div>
      ))}
      <div className="cat-row">
        <input
          className="input-plain grow"
          placeholder="新增類型名稱"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          enterKeyHint="done"
        />
        <button className="btn-pill" onClick={add} disabled={!newName.trim()}>
          新增
        </button>
      </div>
    </section>
  );
}
