import { useState } from 'react';
import { useData } from '../data';
import { db, deleteCardPermanently, saveCardWithRules } from '../db';
import { CARD_COLORS, money, pct, uid } from '../lib/format';
import { formatMd } from '../lib/date';
import type { Card, ChannelType, RewardRule } from '../types';
import { CHANNEL_TYPES, CHANNEL_TYPE_COLORS } from '../types';
import { Dot, Icon, Segmented } from '../components/ui';
import { RuleSheet } from './RuleSheet';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function CardEditor({ cardId, onClose }: { cardId: string | null; onClose: () => void }) {
  const { cards, rules, txns } = useData();
  const existing = cardId ? cards.find((c) => c.id === cardId) : undefined;

  const [card, setCard] = useState<Card>(
    () =>
      existing ?? {
        id: uid(),
        name: '',
        bank: '',
        last4: '',
        color: CARD_COLORS[cards.length % CARD_COLORS.length],
        statementDay: 1,
        roundingMode: 'round',
        archived: false,
        sortOrder: cards.length,
        note: '',
        createdAt: Date.now(),
      },
  );
  const [draftRules, setDraftRules] = useState<RewardRule[]>(() =>
    rules
      .filter((r) => r.cardId === card.id)
      .sort((a, b) => b.rate - a.rate),
  );
  const [editingRule, setEditingRule] = useState<RewardRule | null>(null);
  const [saving, setSaving] = useState(false);

  const patch = (p: Partial<Card>): void => setCard((c) => ({ ...c, ...p }));
  const txnCount = txns.filter((t) => t.cardId === card.id).length;
  const hasGeneral = draftRules.some((r) => r.channelTypes?.length === 3);

  const newRule = (): RewardRule => ({
    id: uid(),
    cardId: card.id,
    channelTypes: hasGeneral ? ['實體'] : ['實體', '網路', '行動支付'],
    rate: hasGeneral ? 3 : 0.5,
    capAmount: null,
    resetPeriod: 'billing',
    channels: [],
    note: '',
    enabled: true,
  });

  const upsertRule = (rule: RewardRule): void => {
    setDraftRules((list) => (list.some((r) => r.id === rule.id) ? list.map((r) => (r.id === rule.id ? rule : r)) : [...list, rule]));
    setEditingRule(null);
  };

  const removeRule = (id: string): void => {
    setDraftRules((list) => list.filter((r) => r.id !== id));
    setEditingRule(null);
  };

  const duplicateRule = (rule: RewardRule): void => {
    setDraftRules((list) => [...list, { ...rule, id: uid(), channels: [...rule.channels] }]);
  };

  const onSave = async (): Promise<void> => {
    if (!card.name.trim()) {
      alert('請輸入卡片名稱');
      return;
    }
    setSaving(true);
    await saveCardWithRules({ ...card, name: card.name.trim(), bank: card.bank.trim() }, draftRules);
    onClose();
  };

  const toggleArchive = async (): Promise<void> => {
    if (!existing) return;
    await db.cards.update(card.id, { archived: !card.archived });
    onClose();
  };

  const onDelete = async (): Promise<void> => {
    if (!existing) return;
    if (!confirm(`永久刪除「${card.name}」以及 ${txnCount} 筆消費紀錄？此動作無法復原。`)) return;
    await deleteCardPermanently(card.id);
    onClose();
  };

  return (
    <div className="page-overlay">
      <header className="nav-bar">
        <button className="btn-text" onClick={onClose}>
          <Icon name="chevL" size={20} /> 返回
        </button>
        <h2>{existing ? '編輯卡片' : '新增卡片'}</h2>
        <button className="btn-text strong" onClick={onSave} disabled={saving}>
          儲存
        </button>
      </header>

      <div className="overlay-body">
        <div className="card-preview" style={{ background: card.color }}>
          <span className="card-preview-bank">{card.bank || '銀行'}</span>
          <span className="card-preview-name">{card.name || '卡片名稱'}</span>
          <span className="card-preview-num">•••• {card.last4 || '0000'}</span>
        </div>

        <section className="form-group">
          <div className="form-row">
            <label>名稱</label>
            <input className="input-plain" placeholder="例：CUBE 卡" value={card.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>銀行</label>
            <input className="input-plain" placeholder="例：國泰世華" value={card.bank} onChange={(e) => patch({ bank: e.target.value })} />
          </div>
          <div className="form-row">
            <label>末四碼</label>
            <input
              className="input-plain"
              inputMode="numeric"
              maxLength={4}
              placeholder="選填"
              value={card.last4 ?? ''}
              onChange={(e) => patch({ last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            />
          </div>
          <div className="form-row">
            <label>結帳日</label>
            <select className="input-plain" value={card.statementDay} onChange={(e) => patch({ statementDay: Number(e.target.value) })}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  每月 {d} 日{d >= 29 ? '（無此日取月底）' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>回饋取整</label>
            <Segmented
              value={card.roundingMode}
              onChange={(v) => patch({ roundingMode: v })}
              options={[
                { value: 'round', label: '四捨五入' },
                { value: 'floor', label: '無條件捨去' },
              ]}
            />
          </div>
          <div className="form-row col">
            <label>顏色</label>
            <div className="swatches">
              {CARD_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${card.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => patch({ color: c })}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div className="form-row col">
            <label>備註</label>
            <textarea className="input-plain" rows={2} placeholder="年費條件、權益等" value={card.note ?? ''} onChange={(e) => patch({ note: e.target.value })} />
          </div>
        </section>

        <div className="section-head">
          <h3 className="section-title">回饋規則</h3>
          <button className="btn-pill" onClick={() => setEditingRule(newRule())}>
            <Icon name="plus" size={18} /> 新增規則
          </button>
        </div>
        {!hasGeneral && (
          <p className="hint">建議新增一條全選（實體、網路、行動支付）的規則，指定通路超過上限或無對應規則時，會改用它計算。</p>
        )}

        <section className="form-group">
          {draftRules.length === 0 && <p className="muted small pad">尚無規則</p>}
          {draftRules.map((r) => {
            const types = r.channelTypes?.length ? r.channelTypes : ['實體'];
            const isAll = types.length === CHANNEL_TYPES.length;
            const label = isAll ? '全通路（一般消費）' : types.join(' · ');
            return (
              <div className={`rule-item ${r.enabled ? '' : 'dim'}`} key={r.id}>
                <button className="rule-item-main" onClick={() => setEditingRule(r)}>
                  <div className="row align-center gap-sm">
                    {types.map((t) => (
                      <Dot key={t} color={CHANNEL_TYPE_COLORS[t as ChannelType]} size={8} />
                    ))}
                    <strong className="grow">{label}</strong>
                    <b className="accent">{pct(r.rate)}</b>
                  </div>
                  <span className="muted small">
                    {r.capAmount == null ? '無上限' : `上限 ${money(r.capAmount)}`}
                    {' · '}
                    {r.resetPeriod === 'billing' ? '依結帳日重置' : '每月 1 日重置'}
                    {r.validTo && ` · 到期日 ${formatMd(r.validTo)}`}
                    {!r.enabled && ' · 停用中'}
                  </span>
                  {r.channels.length > 0 && (
                    <span className="chips wrap">
                      {r.channels.map((c) => (
                        <span className="tag" key={c}>{c}</span>
                      ))}
                    </span>
                  )}
                  {r.note && <span className="rec-note small">{r.note}</span>}
                </button>
                <button className="icon-btn" onClick={() => duplicateRule(r)} aria-label="複製規則">
                  <Icon name="copy" size={18} />
                </button>
              </div>
            );
          })}
        </section>

        {existing && (
          <section className="form-group">
            <button className="danger-row" onClick={toggleArchive}>
              {card.archived ? '取消封存' : '封存卡片（保留紀錄，不再出現在總覽與推薦）'}
            </button>
            <button className="danger-row danger" onClick={onDelete}>
              永久刪除卡片與 {txnCount} 筆紀錄
            </button>
          </section>
        )}
      </div>

      {editingRule && (
        <RuleSheet
          rule={editingRule}
          isNew={!draftRules.some((r) => r.id === editingRule.id)}
          onSave={upsertRule}
          onDelete={() => removeRule(editingRule.id)}
          onClose={() => setEditingRule(null)}
        />
      )}
    </div>
  );
}
