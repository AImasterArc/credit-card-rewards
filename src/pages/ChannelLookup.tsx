import { useMemo, useState } from 'react';
import { useData } from '../data';
import { channelMatches } from '../lib/rewards';
import { today } from '../lib/date';
import { money, pct } from '../lib/format';
import { isRuleActive } from '../lib/rewards';
/** 通路反查：輸入通路名稱，列出所有卡片中對應的規則，依回饋率排序 */
export function ChannelLookup() {
  const { rules, cardMap } = useData();
  const [q, setQ] = useState('');
  const t = today();

  const hits = useMemo(() => {
    if (!q.trim()) return [];
    return rules
      .filter((r) => {
        const card = cardMap.get(r.cardId);
        return card && !card.archived && isRuleActive(r, t) && channelMatches(r.channels, q);
      })
      .sort((a, b) => b.rate - a.rate);
  }, [rules, cardMap, q, t]);

  return (
    <section className="panel">
      <h3 className="panel-title">通路反查</h3>
      <input className="input" placeholder="輸入通路，例：全聯" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() && hits.length === 0 && <p className="muted small mt">沒有卡片的規則包含這個通路</p>}
      {hits.map((r) => {
        const card = cardMap.get(r.cardId)!;
        const types = r.channelTypes?.length ? r.channelTypes : ['實體'];
        const typeLabel = types.length === 3 ? '全通路' : types.join(' · ');
        return (
          <div className="breakdown-row" key={r.id}>
            <span className="card-chip sm" style={{ background: card.color }} />
            <div className="grow">
              <div>{card.name}</div>
              <div className="muted small">
                {typeLabel} · {r.capAmount == null ? '無上限' : `上限 ${money(r.capAmount)}`}
              </div>
              {r.note && <div className="rec-note small">{r.note}</div>}
            </div>
            <b className="accent">{pct(r.rate)}</b>
          </div>
        );
      })}
    </section>
  );
}
