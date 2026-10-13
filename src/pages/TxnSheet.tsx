import { useMemo, useState } from 'react';
import { useData } from '../data';
import { deleteTransaction, saveTransaction } from '../db';
import { today } from '../lib/date';
import { money, num, pct, uid } from '../lib/format';
import { channelMatches, recommend, type Recommendation } from '../lib/rewards';
import type { Transaction } from '../types';
import { Dot, Icon, Sheet } from '../components/ui';

const PREVIEW_AMOUNT = 1000;

export function TxnSheet({ editing, onClose }: { editing?: Transaction; onClose: () => void }) {
  const { categories, cards, rules, txns, categoryMap } = useData();
  const activeCategories = categories.filter((c) => !c.archived || c.id === editing?.categoryId);

  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? activeCategories[0]?.id ?? '');
  const [amountStr, setAmountStr] = useState(editing ? String(Math.abs(editing.amount)) : '');
  const [isRefund, setIsRefund] = useState(editing ? editing.amount < 0 : false);
  const [channel, setChannel] = useState(editing?.channel ?? '');
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? '');
  /** null = 跟隨推薦第一名 */
  const [pickedCardId, setPickedCardId] = useState<string | null>(editing?.cardId ?? null);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const amount = Number(amountStr) || 0;
  const signedAmount = isRefund ? -amount : amount;

  const allChannels = useMemo(() => {
    const set = new Set<string>();
    rules.forEach((r) => r.channels.forEach((c) => set.add(c)));
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-TW'));
  }, [rules]);

  const recs = useMemo(
    () =>
      recommend({
        categoryId,
        amount: amount > 0 ? amount : PREVIEW_AMOUNT,
        date,
        channel,
        cards,
        rules,
        txns: txns.filter((t) => t.id !== editing?.id),
      }),
    [categoryId, amount, date, channel, cards, rules, txns, editing?.id],
  );

  const selectedCardId = pickedCardId ?? recs[0]?.card.id ?? null;
  const visibleRecs = showAll ? recs : recs.slice(0, 3);
  const selectedHidden = !showAll && selectedCardId && !visibleRecs.some((r) => r.card.id === selectedCardId);

  /** 輸入通路時，若只對應到單一類型就自動切換 */
  const onChannelChange = (value: string): void => {
    setChannel(value);
    const exact = rules.filter((r) => r.channels.some((c) => c.toLowerCase() === value.trim().toLowerCase()));
    const cats = new Set(exact.map((r) => r.categoryId));
    if (cats.size === 1) setCategoryId([...cats][0]);
  };

  const canSave = amount > 0 && !!selectedCardId && !!categoryId && !saving;

  const onSave = async (): Promise<void> => {
    if (!canSave || !selectedCardId) return;
    setSaving(true);
    const txn: Transaction = {
      id: editing?.id ?? uid(),
      cardId: selectedCardId,
      categoryId,
      amount: signedAmount,
      date,
      channel: channel.trim(),
      note: note.trim(),
      allocations: [],
      reward: 0,
      createdAt: editing?.createdAt ?? Date.now(),
    };
    await saveTransaction(txn, editing);
    onClose();
  };

  const onDelete = async (): Promise<void> => {
    if (!editing || !confirm('確定刪除這筆消費？')) return;
    await deleteTransaction(editing);
    onClose();
  };

  return (
    <Sheet
      title={editing ? '編輯消費' : '新增消費'}
      onClose={onClose}
      footer={
        <div className="row gap">
          {editing && (
            <button className="btn-danger icon-btn" onClick={onDelete} aria-label="刪除">
              <Icon name="trash" />
            </button>
          )}
          <button className="btn-primary grow" disabled={!canSave} onClick={onSave}>
            {editing ? '儲存變更' : '記一筆'}
          </button>
        </div>
      }
    >
      <label className="field-label">消費類型</label>
      <div className="chips">
        {activeCategories.map((c) => (
          <button
            key={c.id}
            className={`chip ${c.id === categoryId ? 'active' : ''}`}
            style={c.id === categoryId ? { background: c.color, borderColor: c.color } : undefined}
            onClick={() => setCategoryId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="amount-row">
        <span className="amount-prefix">{isRefund ? '-$' : '$'}</span>
        <input
          className="amount-input"
          inputMode="decimal"
          placeholder="0"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ''))}
          autoFocus={!editing}
        />
        <button className={`chip small ${isRefund ? 'active danger' : ''}`} onClick={() => setIsRefund((v) => !v)}>
          退款
        </button>
      </div>

      <div className="grid-2">
        <div>
          <label className="field-label">通路（選填）</label>
          <input
            className="input"
            list="channel-list"
            placeholder="例：全聯"
            value={channel}
            onChange={(e) => onChannelChange(e.target.value)}
          />
          <datalist id="channel-list">
            {allChannels.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="field-label">日期</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
        </div>
      </div>

      <label className="field-label">
        推薦刷卡 {amount <= 0 && <span className="muted">（以 {num(PREVIEW_AMOUNT)} 元試算）</span>}
      </label>
      {recs.length === 0 && <p className="muted small">尚無卡片，請先到卡片庫新增。</p>}
      <div className="rec-list">
        {visibleRecs.map((r, i) => (
          <RecItem
            key={r.card.id}
            rec={r}
            rank={i + 1}
            selected={r.card.id === selectedCardId}
            channel={channel}
            categoryName={categoryMap.get(categoryId)?.name ?? ''}
            onSelect={() => setPickedCardId(r.card.id)}
          />
        ))}
        {selectedHidden && (
          <p className="muted small">已選：{cards.find((c) => c.id === selectedCardId)?.name}</p>
        )}
        {recs.length > 3 && (
          <button className="btn-text" onClick={() => setShowAll((v) => !v)}>
            {showAll ? '收合' : `顯示全部 ${recs.length} 張卡`}
          </button>
        )}
      </div>

      <label className="field-label">備註</label>
      <input className="input" placeholder="選填" value={note} onChange={(e) => setNote(e.target.value)} />
    </Sheet>
  );
}

function RecItem({
  rec,
  rank,
  selected,
  channel,
  categoryName,
  onSelect,
}: {
  rec: Recommendation;
  rank: number;
  selected: boolean;
  channel: string;
  categoryName: string;
  onSelect: () => void;
}) {
  const { ruleMap } = useData();
  const { card, reward, effectiveRate, rules, hasDesignated, capped, usedFallback, fallbackRule, channelHit, channelMiss, allocation } = rec;

  const warnings: string[] = [];
  if (!hasDesignated) warnings.push(fallbackRule ? `無「${categoryName}」回饋，以一般消費 ${pct(fallbackRule.rate)} 計` : `無「${categoryName}」回饋`);
  else if (capped) warnings.push(fallbackRule ? `已達上限，以一般消費 ${pct(fallbackRule.rate)} 計` : '已達上限');
  else if (usedFallback) warnings.push('部分金額超過上限');
  if (channelMiss) warnings.push('通路不在此卡清單內');

  return (
    <button className={`rec ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="rec-head">
        <span className="rec-rank">{rank}</span>
        <span className="card-chip sm" style={{ background: card.color }} />
        <span className="rec-name">{card.name}</span>
        <span className="rec-reward">
          <b>{money(reward)}</b>
          <span className="muted small">{pct(effectiveRate, 2)}</span>
        </span>
      </div>

      {hasDesignated && (
        <div className="rec-meta small">
          {rules.map((r) => (
            <span key={r.id} className="tag">
              {pct(r.rate)} · {r.capAmount == null ? '無上限' : `剩 ${money(rec.remainingByRule[r.id] ?? 0)}`}
            </span>
          ))}
        </div>
      )}

      {allocation.allocations.length > 1 && (
        <div className="rec-split small muted">
          {allocation.allocations.map((a) => `${money(a.spend)} @${pct(ruleMap.get(a.ruleId)?.rate ?? 0)}`).join(' + ')}
          {allocation.unrewarded > 0 && ` + ${money(allocation.unrewarded)} @0%`}
        </div>
      )}

      {warnings.length > 0 && <div className="rec-warn small">{warnings.join('；')}</div>}

      {rules.map((r) =>
        r.channels.length || r.note ? (
          <div key={r.id} className="rec-detail">
            {r.channels.length > 0 && (
              <div className="chips wrap">
                {r.channels.map((c) => (
                  <span key={c} className={`tag ${channel && channelMatches([c], channel) ? 'hit' : ''}`}>
                    {c}
                  </span>
                ))}
              </div>
            )}
            {r.note && <p className="rec-note small">{r.note}</p>}
          </div>
        ) : null,
      )}
      {channelHit && (
        <span className="rec-hit small">
          <Dot color="var(--green)" size={8} /> 通路符合
        </span>
      )}
    </button>
  );
}
