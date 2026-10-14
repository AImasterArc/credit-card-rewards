import { useMemo, useState } from 'react';
import { useData } from '../data';
import { addMonths, formatMd, formatYm, today, weekday } from '../lib/date';
import { money, pct, signedMoney } from '../lib/format';
import type { ChannelType, Transaction } from '../types';
import { CHANNEL_TYPES, CHANNEL_TYPE_COLORS } from '../types';
import { Dot, Empty, Icon } from '../components/ui';

const CHART_MONTHS = 6;

export function Records({ onEditTxn }: { onEditTxn: (t: Transaction) => void }) {
  const { txns, cardMap } = useData();
  const currentMonth = today().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [cardFilter, setCardFilter] = useState<string>('all');

  const monthTxns = useMemo(
    () =>
      txns
        .filter((t) => t.date.startsWith(month) && (cardFilter === 'all' || t.cardId === cardFilter))
        .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
    [txns, month, cardFilter],
  );

  const totalSpend = monthTxns.reduce((s, t) => s + t.amount, 0);
  const totalReward = monthTxns.reduce((s, t) => s + t.reward, 0);

  const chart = useMemo(() => {
    const months = Array.from({ length: CHART_MONTHS }, (_, i) => addMonths(month, i - CHART_MONTHS + 1));
    const data = months.map((m) => {
      const list = txns.filter((t) => t.date.startsWith(m) && (cardFilter === 'all' || t.cardId === cardFilter));
      return { month: m, reward: list.reduce((s, t) => s + t.reward, 0), spend: list.reduce((s, t) => s + t.amount, 0) };
    });
    const max = Math.max(1, ...data.map((d) => d.reward));
    return { data, max };
  }, [txns, month, cardFilter]);

  const byCard = groupSum(monthTxns, (t) => t.cardId);
  const byChannelType = CHANNEL_TYPES.map((type) => {
    const list = monthTxns.filter((t) => (t.channelTypes ?? ['實體']).includes(type));
    return {
      type,
      color: CHANNEL_TYPE_COLORS[type],
      spend: list.reduce((s, t) => s + t.amount, 0),
      reward: list.reduce((s, t) => s + t.reward, 0),
    };
  }).filter((x) => x.spend > 0);
  const byDate = new Map<string, Transaction[]>();
  monthTxns.forEach((t) => byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]));

  const usedCards = [...new Set(txns.map((t) => t.cardId))].map((id) => cardMap.get(id)).filter((c) => !!c);

  return (
    <>
      <header className="page-header">
        <h1>消費紀錄</h1>
      </header>

      <div className="month-switch">
        <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="上個月">
          <Icon name="chevL" />
        </button>
        <button className="month-label" onClick={() => setMonth(currentMonth)}>
          {formatYm(month)}
        </button>
        <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= currentMonth} aria-label="下個月">
          <Icon name="chevR" />
        </button>
      </div>

      {usedCards.length > 1 && (
        <div className="chips pad-x">
          <button className={`chip ${cardFilter === 'all' ? 'active' : ''}`} onClick={() => setCardFilter('all')}>
            全部卡片
          </button>
          {usedCards.map((c) => (
            <button key={c.id} className={`chip ${cardFilter === c.id ? 'active' : ''}`} onClick={() => setCardFilter(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <section className="summary">
        <div>
          <span className="summary-label">消費</span>
          <span className="summary-value">{money(totalSpend)}</span>
        </div>
        <div>
          <span className="summary-label">回饋</span>
          <span className="summary-value accent">{money(totalReward)}</span>
        </div>
        <div>
          <span className="summary-label">回饋率</span>
          <span className="summary-value">{totalSpend > 0 ? pct((totalReward / totalSpend) * 100, 2) : '—'}</span>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">近 {CHART_MONTHS} 個月回饋</h3>
        <div className="month-chart">
          {chart.data.map((d) => (
            <button key={d.month} className={`month-col ${d.month === month ? 'active' : ''}`} onClick={() => setMonth(d.month)}>
              <span className="month-col-value">{d.reward > 0 ? money(d.reward) : ''}</span>
              <span className="month-col-bar" style={{ height: `${(d.reward / chart.max) * 100}%` }} />
              <span className="month-col-label">{Number(d.month.slice(5))}月</span>
            </button>
          ))}
        </div>
      </section>

      {monthTxns.length === 0 ? (
        <Empty title="這個月沒有消費紀錄" />
      ) : (
        <>
          {cardFilter === 'all' && (
            <section className="panel">
              <h3 className="panel-title">各卡片</h3>
              {byCard.map(([id, s]) => {
                const card = cardMap.get(id);
                return (
                  <div className="breakdown-row" key={id}>
                    <span className="card-chip sm" style={{ background: card?.color ?? '#999' }} />
                    <span className="grow">{card?.name ?? '已刪除卡片'}</span>
                    <span className="muted small">{money(s.spend)}</span>
                    <b className="accent breakdown-reward">{money(s.reward)}</b>
                  </div>
                );
              })}
            </section>
          )}

          <section className="panel">
            <h3 className="panel-title">各通路類型</h3>
            {byChannelType.map((s) => {
              const share = totalSpend > 0 ? (s.spend / totalSpend) * 100 : 0;
              return (
                <div className="breakdown-row col" key={s.type}>
                  <div className="row">
                    <Dot color={s.color} />
                    <span className="grow">
                      {s.type} <span className="muted small">{share.toFixed(0)}%</span>
                    </span>
                    <span className="muted small">{money(s.spend)}</span>
                    <b className="accent breakdown-reward">{money(s.reward)}</b>
                  </div>
                  <div className="bar thin">
                    <div className="bar-fill" style={{ width: `${Math.max(0, share)}%`, background: s.color }} />
                  </div>
                </div>
              );
            })}
          </section>

          <section className="panel flush">
            <h3 className="panel-title pad-x">明細</h3>
            {[...byDate.entries()].map(([date, list]) => (
              <div key={date}>
                <div className="date-head">
                  {formatMd(date)}（{weekday(date)}）
                  <span className="muted">{money(list.reduce((s, t) => s + t.amount, 0))}</span>
                </div>
                {list.map((t) => {
                  const card = cardMap.get(t.cardId);
                  const types = t.channelTypes?.length ? t.channelTypes : ['實體'];
                  const typeLabel = types.join(' · ');
                  const dotColor = CHANNEL_TYPE_COLORS[types[0] as ChannelType] ?? '#999';
                  return (
                    <button className="txn-row" key={t.id} onClick={() => onEditTxn(t)}>
                      <Dot color={dotColor} />
                      <div className="grow txn-main">
                        <span>{t.channel || typeLabel || '消費'}</span>
                        <span className="muted small">
                          {card?.name ?? '已刪除卡片'} · {typeLabel}
                          {t.note && ` · ${t.note}`}
                        </span>
                      </div>
                      <div className="txn-amount">
                        <span className={t.amount < 0 ? 'danger' : ''}>{money(t.amount)}</span>
                        <span className={`small ${t.reward < 0 ? 'danger' : 'accent'}`}>{signedMoney(t.reward)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}

function groupSum(list: Transaction[], key: (t: Transaction) => string): [string, { spend: number; reward: number }][] {
  const map = new Map<string, { spend: number; reward: number }>();
  for (const t of list) {
    const k = key(t);
    const cur = map.get(k) ?? { spend: 0, reward: 0 };
    cur.spend += t.amount;
    cur.reward += t.reward;
    map.set(k, cur);
  }
  return [...map.entries()].sort((a, b) => b[1].spend - a[1].spend);
}

