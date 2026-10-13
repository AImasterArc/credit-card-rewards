import { useData } from '../data';
import { money, pct } from '../lib/format';
import { Empty, Icon } from '../components/ui';
import { ChannelLookup } from './ChannelLookup';
import type { Card } from '../types';

export function Cards({ onOpenCard }: { onOpenCard: (id: string | null) => void }) {
  const { cards } = useData();
  const active = cards.filter((c) => !c.archived);
  const archived = cards.filter((c) => c.archived);

  return (
    <>
      <header className="page-header row">
        <h1 className="grow">卡片庫</h1>
        <button className="btn-pill" onClick={() => onOpenCard(null)}>
          <Icon name="plus" size={18} /> 新增卡片
        </button>
      </header>

      {active.length === 0 && (
        <Empty
          title="還沒有卡片"
          desc="新增卡片後，可以為每張卡設定多條回饋規則"
          action={<button className="btn-primary" onClick={() => onOpenCard(null)}>新增第一張卡</button>}
        />
      )}

      {active.length > 0 && <ChannelLookup />}

      <div className="list">
        {active.map((c) => (
          <CardRow key={c.id} card={c} onClick={() => onOpenCard(c.id)} />
        ))}
      </div>

      {archived.length > 0 && (
        <>
          <h3 className="section-title">已封存</h3>
          <div className="list dim">
            {archived.map((c) => (
              <CardRow key={c.id} card={c} onClick={() => onOpenCard(c.id)} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function CardRow({ card, onClick }: { card: Card; onClick: () => void }) {
  const { rules, categoryMap } = useData();
  const cardRules = rules.filter((r) => r.cardId === card.id && r.enabled);
  const best = cardRules.reduce((m, r) => Math.max(m, r.rate), 0);

  return (
    <button className="list-row" onClick={onClick}>
      <span className="card-face" style={{ background: card.color }}>
        {card.last4 && <span className="card-face-num">•• {card.last4}</span>}
      </span>
      <div className="grow list-row-main">
        <strong>{card.name}</strong>
        <span className="muted small">
          {card.bank && `${card.bank} · `}每月 {card.statementDay} 日結帳 · {cardRules.length} 條規則
        </span>
        <span className="chips wrap">
          {cardRules.slice(0, 4).map((r) => (
            <span key={r.id} className="tag">
              {categoryMap.get(r.categoryId)?.name} {pct(r.rate)}
              {r.capAmount != null && ` / ${money(r.capAmount)}`}
            </span>
          ))}
          {cardRules.length > 4 && <span className="tag">+{cardRules.length - 4}</span>}
        </span>
      </div>
      {best > 0 && <span className="accent small">最高 {pct(best)}</span>}
      <Icon name="chevR" size={18} />
    </button>
  );
}
