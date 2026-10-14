import { useState, type KeyboardEvent } from 'react';
import type { ChannelType, RewardRule } from '../types';
import { CHANNEL_TYPES, CHANNEL_TYPE_COLORS } from '../types';
import { Icon, Segmented, Sheet } from '../components/ui';

interface Props {
  rule: RewardRule;
  isNew: boolean;
  onSave: (rule: RewardRule) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function RuleSheet({ rule, isNew, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<RewardRule>(() => ({
    ...rule,
    channelTypes: rule.channelTypes?.length ? rule.channelTypes : ['實體'],
  }));
  const [rateStr, setRateStr] = useState(String(rule.rate));
  const [capStr, setCapStr] = useState(rule.capAmount == null ? '' : String(rule.capAmount));
  const [channelInput, setChannelInput] = useState('');

  const patch = (p: Partial<RewardRule>): void => setDraft((d) => ({ ...d, ...p }));

  const toggleChannelType = (t: ChannelType): void => {
    const set = new Set(draft.channelTypes);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    patch({ channelTypes: [...set] });
  };

  const selectAllChannelTypes = (): void => {
    if (draft.channelTypes.length === CHANNEL_TYPES.length) {
      patch({ channelTypes: ['實體'] });
    } else {
      patch({ channelTypes: [...CHANNEL_TYPES] });
    }
  };

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

  const rate = Number(rateStr);
  const valid = (draft.channelTypes?.length ?? 0) > 0 && Number.isFinite(rate) && rate >= 0;

  const submit = (): void => {
    if (!valid) return;
    const cap = capStr.trim() === '' ? null : Math.max(0, Number(capStr));
    const pending = channelInput.trim()
      ? [...new Set([...draft.channels, ...channelInput.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)])]
      : draft.channels;
    onSave({
      ...draft,
      channelTypes: draft.channelTypes,
      rate,
      capAmount: cap != null && Number.isFinite(cap) ? cap : null,
      channels: pending,
      note: draft.note.trim(),
      validTo: draft.validTo || undefined,
    });
  };

  const isAll = draft.channelTypes.length === CHANNEL_TYPES.length;

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
      <div className="row justify-between align-center">
        <label className="field-label" style={{ margin: 0 }}>通路類型（可複選）</label>
        <button type="button" className="link-btn small" onClick={selectAllChannelTypes}>
          {isAll ? '取消全選' : '全選（全通路/一般消費）'}
        </button>
      </div>

      <div className="chips mt">
        {CHANNEL_TYPES.map((t) => {
          const active = draft.channelTypes.includes(t);
          return (
            <button
              key={t}
              type="button"
              className={`chip ${active ? 'active' : ''}`}
              style={active ? { background: CHANNEL_TYPE_COLORS[t], borderColor: CHANNEL_TYPE_COLORS[t] } : undefined}
              onClick={() => toggleChannelType(t)}
            >
              {t}
            </button>
          );
        })}
      </div>
      <p className="hint" style={{ marginTop: 4 }}>
        {isAll ? '全選代表全通路（相當於一般消費保底）' : draft.channelTypes.length === 0 ? '請至少選取一個通路類型' : `適用：${draft.channelTypes.join('、')}`}
      </p>

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
        <div>
          <label className="field-label">活動結束</label>
          <input className="input" type="date" value={draft.validTo ?? ''} onChange={(e) => patch({ validTo: e.target.value })} />
        </div>
        <label className="toggle-row" style={{ marginTop: 12 }}>
          <span>啟用</span>
          <input type="checkbox" className="switch" checked={draft.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        </label>
      </details>
    </Sheet>
  );
}
