import { useState, type KeyboardEvent } from 'react';
import { useData } from '../data';
import { db } from '../db';
import { uid } from '../lib/format';
import type { RewardRule } from '../types';
import { Icon, Segmented, Sheet } from '../components/ui';

const NEW_CATEGORY = '__new__';
const RANDOM_COLORS = ['#ff9500', '#34c759', '#007aff', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#a2845e', '#5856d6', '#30b0c7'];

interface Props {
  rule: RewardRule;
  isNew: boolean;
  onSave: (rule: RewardRule) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function RuleSheet({ rule, isNew, onSave, onDelete, onClose }: Props) {
  const { categories } = useData();
  const [draft, setDraft] = useState<RewardRule>(rule);
  const [rateStr, setRateStr] = useState(String(rule.rate));
  const [capStr, setCapStr] = useState(rule.capAmount == null ? '' : String(rule.capAmount));
  const [channelInput, setChannelInput] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);

  const patch = (p: Partial<RewardRule>): void => setDraft((d) => ({ ...d, ...p }));
  const selectable = categories.filter((c) => !c.archived || c.id === draft.categoryId);

  const addChannels = (): void => {
    const items = channelInput
      .split(/[,，、\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!items.length) return;
    patch({ channels: [...new Set([...draft.channels, ...items])] });
    setChannelInput('');
  };

  const onChannelKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addChannels();
    }
  };

  const createCategory = async (): Promise<void> => {
    const name = newCatName.trim();
    if (!name) return;
    const id = uid();
    await db.categories.add({
      id,
      name,
      color: RANDOM_COLORS[categories.length % RANDOM_COLORS.length],
      sortOrder: Math.max(0, ...categories.map((c) => c.sortOrder)) + 1,
      archived: false,
    });
    patch({ categoryId: id });
    setNewCatName('');
    setAddingCat(false);
  };

  const rate = Number(rateStr);
  const valid = !!draft.categoryId && Number.isFinite(rate) && rate >= 0;

  const submit = (): void => {
    if (!valid) return;
    const cap = capStr.trim() === '' ? null : Math.max(0, Number(capStr));
    const pending = channelInput.trim()
      ? [...new Set([...draft.channels, ...channelInput.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)])]
      : draft.channels;
    onSave({
      ...draft,
      rate,
      capAmount: cap != null && Number.isFinite(cap) ? cap : null,
      channels: pending,
      note: draft.note.trim(),
      validFrom: draft.validFrom || undefined,
      validTo: draft.validTo || undefined,
    });
  };

  return (
    <Sheet
      title={isNew ? '新增回饋規則' : '編輯回饋規則'}
      onClose={onClose}
      footer={
        <div className="row gap">
          {!isNew && (
            <button className="btn-danger icon-btn" onClick={() => confirm('刪除這條規則？') && onDelete()} aria-label="刪除">
              <Icon name="trash" />
            </button>
          )}
          <button className="btn-primary grow" disabled={!valid} onClick={submit}>
            完成
          </button>
        </div>
      }
    >
      <label className="field-label">消費類型</label>
      <select
        className="input"
        value={addingCat ? NEW_CATEGORY : draft.categoryId}
        onChange={(e) => {
          if (e.target.value === NEW_CATEGORY) setAddingCat(true);
          else {
            setAddingCat(false);
            patch({ categoryId: e.target.value });
          }
        }}
      >
        <option value="" disabled>
          請選擇
        </option>
        {selectable.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={NEW_CATEGORY}>＋ 新增類型…</option>
      </select>
      {addingCat && (
        <div className="row gap mt">
          <input className="input grow" autoFocus placeholder="新類型名稱" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
          <button className="btn-pill" onClick={createCategory} disabled={!newCatName.trim()}>
            新增
          </button>
        </div>
      )}

      <div className="grid-2">
        <div>
          <label className="field-label">回饋 %</label>
          <div className="input-suffix">
            <input className="input" inputMode="decimal" value={rateStr} onChange={(e) => setRateStr(e.target.value.replace(/[^\d.]/g, ''))} />
            <span>%</span>
          </div>
        </div>
        <div>
          <label className="field-label">每期消費上限</label>
          <div className="input-suffix">
            <input className="input" inputMode="numeric" placeholder="空白 = 無上限" value={capStr} onChange={(e) => setCapStr(e.target.value.replace(/\D/g, ''))} />
            <span>元</span>
          </div>
        </div>
      </div>
      {capStr && rate > 0 && <p className="hint">回饋上限約 ${Math.round((Number(capStr) * rate) / 100)} 元</p>}

      <label className="field-label">額度重置</label>
      <Segmented
        value={draft.resetPeriod}
        onChange={(v) => patch({ resetPeriod: v })}
        options={[
          { value: 'billing', label: '依卡片結帳日' },
          { value: 'calendarMonth', label: '每月 1 日' },
        ]}
      />

      <label className="field-label">對應通路</label>
      <div className="row gap">
        <input
          className="input grow"
          placeholder="輸入後按 Enter，可用逗號一次加多個"
          value={channelInput}
          onChange={(e) => setChannelInput(e.target.value)}
          onKeyDown={onChannelKey}
          enterKeyHint="done"
        />
        <button className="btn-pill" onClick={addChannels} disabled={!channelInput.trim()}>
          加入
        </button>
      </div>
      {draft.channels.length > 0 && (
        <div className="chips wrap mt">
          {draft.channels.map((c) => (
            <button key={c} className="tag removable" onClick={() => patch({ channels: draft.channels.filter((x) => x !== c) })}>
              {c} <Icon name="close" size={12} />
            </button>
          ))}
        </div>
      )}

      <label className="field-label">筆記（限制 / 規則）</label>
      <textarea
        className="input"
        rows={3}
        placeholder="例：需每月登錄；排除超商代收；需切換權益方案"
        value={draft.note}
        onChange={(e) => patch({ note: e.target.value })}
      />

      <details className="advanced">
        <summary>進階設定</summary>
        <div className="grid-2">
          <div>
            <label className="field-label">活動開始</label>
            <input className="input" type="date" value={draft.validFrom ?? ''} onChange={(e) => patch({ validFrom: e.target.value })} />
          </div>
          <div>
            <label className="field-label">活動結束</label>
            <input className="input" type="date" value={draft.validTo ?? ''} onChange={(e) => patch({ validTo: e.target.value })} />
          </div>
        </div>
        <label className="field-label">優先順序（同卡同類型多條規則時，數字小的先用）</label>
        <input className="input" inputMode="numeric" value={draft.priority} onChange={(e) => patch({ priority: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
        <label className="toggle-row">
          <span>啟用</span>
          <input type="checkbox" className="switch" checked={draft.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        </label>
      </details>
    </Sheet>
  );
}
