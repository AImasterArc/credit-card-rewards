import { useMemo, useState } from 'react';
import { useData } from '../data';
import { deleteTransaction, saveTransaction } from '../db';
import { today } from '../lib/date';
import { money, pct, uid } from '../lib/format';
import { channelMatches, recommend, type Recommendation } from '../lib/rewards';
import type { ChannelType, Transaction } from '../types';
import { CHANNEL_TYPES, CHANNEL_TYPE_COLORS } from '../types';
import { Dot, Icon, Sheet } from '../components/ui';

const PREVIEW_AMOUNT = 1000;

export function TxnSheet({ editing, onClose }: { editing?: Transaction; onClose: () => void }) {
  const { cards, rules, txns } = useData();

  const [channelTypes, setChannelTypes] = useState<ChannelType[]>(
    editing?.channelTypes?.length ? editing.channelTypes : ['實體'],
  );
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
        channelTypes,
        amount: amount > 0 ? amount : PREVIEW_AMOUNT,
        date,
        channel,
        cards,
        rules,
        txns: txns.filter((t) => t.id !== editing?.id),
      }),
    [channelTypes, amount, date, channel, cards, rules, txns, editing?.id],
  );

  const selectedCardId = pickedCardId ?? recs[0]?.card.id ?? null;
  const visibleRecs = showAll ? recs : recs.slice(0, 3);
  const selectedHidden = !showAll && selectedCardId && !visibleRecs.some((r) => r.card.id === selectedCardId);

  const toggleChannelType = (t: ChannelType): void => {
    setChannelTypes((prev) => {
      if (prev.includes(t)) {
        if (prev.length === 1) return prev; // 至少保留一項
        return prev.filter((x) => x !== t);
      }
      return [...prev, t];
    });
  };

  const canSave = amount > 0 && !!selectedCardId && channelTypes.length > 0 && !saving;

  const onSave = async (): Promise<void> => {
    if (!canSave || !selectedCardId) return;
    setSaving(true);
    const txn: Transaction = {
      id: editing?.id ?? uid(),
      cardId: selectedCardId,
      channelTypes,
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

  const typesSummary = channelTypes.join('、');

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
      <label className="field-label">通路類型（可複選）</label>
      <div className="chips">
        {CHANNEL_TYPES.map((t) => {
          const active = channelTypes.includes(t);
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
          <label className="field-label">特定店家 / 通路（選填）</label>
          <input
            className="input"
            list="channel-list"
            placeholder="例：全聯、Uber Eats"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
          <datalist id="channel-list">
            {allChannels.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="field-label">消費日期</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="section-head mt">
        <label className="field-label" style={{ margin: 0 }}>
          推薦信用卡（{typesSummary}，{amount > 0 ? `刷 $${amount}` : '試算 $1,000'}）
        </label>
        {pickedCardId && (
          <button className="btn-text small" onClick={() => setPickedCardId(null)}>
            改回推薦第一名
          </button>
        )}
      </div>

      {recs.length === 0 && <p className="muted small">尚無卡片，請先到卡片庫新增。</p>}
      <div className="rec-list">
        {visibleRecs.map((r, i) => (
          <RecItem
            key={r.card.id}
            rec={r}
            rank={i + 1}
            selected={r.card.id === selectedCardId}
            channel={channel}
            typesSummary={typesSummary}
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
  typesSummary,
  onSelect,
}: {
  rec: Recommendation;
  rank: number;
  selected: boolean;
  channel: string;
  typesSummary: string;
  onSelect: () => void;
}) {
  const { ruleMap } = useData();
  const { card, reward, effectiveRate, rules, hasDesignated, capped, usedFallback, fallbackRule, channelHit, channelMiss, allocation } = rec;

  const warnings: string[] = [];
  if (!hasDesignated) warnings.push(fallbackRule ? `無指定「${typesSummary}」加碼，以全通路 ${pct(fallbackRule.rate)} 計` : `無「${typesSummary}」回饋`);
  else if (capped) warnings.push(fallbackRule ? `已達上限，超出以全通路 ${pct(fallbackRule.rate)} 計` : '已達上限');
  else if (usedFallback) warnings.push('部分金額超過上限，改用全通路保底計算');
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
              {(r.channelTypes ?? []).join('/')} {pct(r.rate)} · {r.capAmount == null ? '無上限' : `剩 ${money(rec.remainingByRule[r.id] ?? 0)}`}
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
