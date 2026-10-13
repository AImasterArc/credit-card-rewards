import { useData } from '../data';
import { diffDays, formatMd, getBillingCycle, today } from '../lib/date';
import { money, pct } from '../lib/format';
import { isRuleActive, usedSpend } from '../lib/rewards';
import type { Card } from '../types';
import { Dot, Empty, ProgressBar } from '../components/ui';
import { BackupReminder } from './Settings';

export function Dashboard({ onOpenCard, onGoCards }: { onOpenCard: (id: string) => void; onGoCards: () => void }) {
  const { cards, txns } = useData();
  const t = today();
  const month = t.slice(0, 7);
  const activeCards = cards.filter((c) => !c.archived);
  const monthTxns = txns.filter((x) => x.date.startsWith(month));
  const monthSpend = monthTxns.reduce((s, x) => s + x.amount, 0);
  const monthReward = monthTxns.reduce((s, x) => s + x.reward, 0);

  return (
    <>
      <header className="page-header">
        <h1>回饋總覽</h1>
      </header>

      <BackupReminder />
      <ExpiryReminder />

      <section className="summary">
        <div>
          <span className="summary-label">本月消費</span>
          <span className="summary-value">{money(monthSpend)}</span>
        </div>
        <div>
          <span className="summary-label">本月回饋</span>
          <span className="summary-value accent">{money(monthReward)}</span>
        </div>
        <div>
          <span className="summary-label">回饋率</span>
          <span className="summary-value">{monthSpend > 0 ? pct((monthReward / monthSpend) * 100, 2) : '—'}</span>
        </div>
      </section>

      {activeCards.length === 0 ? (
        <Empty
          title="還沒有卡片"
          desc="先到卡片庫新增卡片與回饋規則"
          action={<button className="btn-primary" onClick={onGoCards}>前往卡片庫</button>}
        />
      ) : (
        activeCards.map((card) => <CardUsage key={card.id} card={card} todayYmd={t} onOpen={() => onOpenCard(card.id)} />)
      )}
    </>
  );
}

function ExpiryReminder() {
  const { rules, cardMap, categoryMap } = useData();
  const t = today();
  const soon = rules
    .filter((r) => r.enabled && r.validTo && r.validTo >= t && diffDays(t, r.validTo) <= 7 && !cardMap.get(r.cardId)?.archived)
    .sort((a, b) => a.validTo!.localeCompare(b.validTo!));
  if (soon.length === 0) return null;
  return (
    <div className="banner column">
      {soon.map((r) => (
        <span key={r.id}>
          {cardMap.get(r.cardId)?.name} 的「{categoryMap.get(r.categoryId)?.name} {pct(r.rate)}」{diffDays(t, r.validTo!) === 0 ? '今天' : `${diffDays(t, r.validTo!)} 天後`}到期
        </span>
      ))}
    </div>
  );
}

function CardUsage({ card, todayYmd, onOpen }: { card: Card; todayYmd: string; onOpen: () => void }) {
  const { rules, txns, categoryMap } = useData();
  const cardTxns = txns.filter((x) => x.cardId === card.id);
  const cardRules = rules
    .filter((r) => r.cardId === card.id && isRuleActive(r, todayYmd))
    .sort(
      (a, b) =>
        (categoryMap.get(a.categoryId)?.sortOrder ?? 99) - (categoryMap.get(b.categoryId)?.sortOrder ?? 99) ||
        a.priority - b.priority,
    );

  const [start, end] = getBillingCycle(card.statementDay, todayYmd);
  const daysLeft = diffDays(todayYmd, end) + 1;
  const cycleTxns = cardTxns.filter((x) => x.date >= start && x.date <= end);
  const cycleReward = cycleTxns.reduce((s, x) => s + x.reward, 0);
  const cycleSpend = cycleTxns.reduce((s, x) => s + x.amount, 0);

  return (
    <section className="card-block" onClick={onOpen}>
      <div className="card-block-head">
        <div className="card-chip" style={{ background: card.color }} />
        <div className="card-block-title">
          <strong>{card.name}</strong>
          <span className="muted small">
            {formatMd(start)} – {formatMd(end)} · {daysLeft} 天後重置
          </span>
        </div>
        <div className="card-block-reward">
          <span className="accent">{money(cycleReward)}</span>
          <span className="muted small">本期消費 {money(cycleSpend)}</span>
        </div>
      </div>

      {cardRules.length === 0 && <p className="muted small pad">尚未設定回饋規則</p>}

      {cardRules.map((rule) => {
        const cat = categoryMap.get(rule.categoryId);
        const used = usedSpend(rule, card, todayYmd, cardTxns);
        const color = cat?.color ?? '#8e8e93';
        const capped = rule.capAmount != null;
        const remaining = capped ? Math.max(0, rule.capAmount! - used) : Infinity;
        const ratio = capped && rule.capAmount! > 0 ? used / rule.capAmount! : 0;
        return (
          <div className="rule-row" key={rule.id}>
            <div className="rule-row-head">
              <span className="rule-name">
                <Dot color={color} /> {cat?.name ?? '未知類型'} <b>{pct(rule.rate)}</b>
                {rule.resetPeriod === 'calendarMonth' && <span className="tag">自然月</span>}
                {rule.validTo && <span className="tag">至 {formatMd(rule.validTo)}</span>}
              </span>
              <span className={`rule-remaining ${ratio >= 1 ? 'full' : ratio >= 0.8 ? 'warn' : ''}`}>
                {capped ? (ratio >= 1 ? '已滿' : `剩 ${money(remaining)}`) : '無上限'}
              </span>
            </div>
            {capped ? (
              <>
                <ProgressBar value={used} max={rule.capAmount!} color={color} />
                <div className="rule-row-foot muted small">
                  {money(used)} / {money(rule.capAmount!)}
                </div>
              </>
            ) : (
              <div className="rule-row-foot muted small">本期已刷 {money(used)}</div>
            )}
          </div>
        );
      })}
    </section>
  );
}
