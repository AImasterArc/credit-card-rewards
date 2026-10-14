import { useEffect, useRef, useState } from 'react';
import { useData } from '../data';
import { exportBackup, importBackup, isBackupFile, resetAll } from '../db';
import { CardFileSection } from './CardFile';
import type { ChannelType } from '../types';
import { CHANNEL_TYPES, CHANNEL_TYPE_COLORS } from '../types';

const LAST_BACKUP_KEY = 'cc-rewards:lastBackup';
const BACKUP_REMIND_DAYS = 7;

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
  const { cards, rules, txns } = useData();
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

  return (
    <>
      <header className="page-header">
        <h1>設定</h1>
      </header>

      <ChannelTypeSection />

      <CardFileSection />

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

function ChannelTypeSection() {
  const { rules, txns } = useData();
  const descriptions: Record<ChannelType, string> = {
    實體: '門市實體刷卡、實體感應消費',
    網路: '網購、電商平台、外送平台、線上刷卡',
    行動支付: 'Apple Pay、Google Pay、LINE Pay、全支付等',
  };

  return (
    <>
      <h3 className="section-title">通路類型</h3>
      <section className="form-group">
        {CHANNEL_TYPES.map((type) => {
          const ruleCount = rules.filter((r) => (r.channelTypes ?? []).includes(type)).length;
          const txnCount = txns.filter((t) => (t.channelTypes ?? []).includes(type)).length;
          return (
            <div className="list-btn" key={type}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: CHANNEL_TYPE_COLORS[type],
                  marginRight: 10,
                  flex: 'none',
                }}
              />
              <div className="grow">
                <strong>{type}</strong>
                <div className="muted small">{descriptions[type]}</div>
              </div>
              <span className="muted small">
                {ruleCount} 條規則 · {txnCount} 筆消費
              </span>
            </div>
          );
        })}
      </section>
      <p className="hint pad-x">
        記帳與卡片規則皆支援通路類型複選。全選（實體、網路、行動支付）即為全通路 / 一般消費保底。
      </p>
    </>
  );
}
