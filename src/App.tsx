import { useState } from 'react';
import { DataProvider } from './data';
import { Dashboard } from './pages/Dashboard';
import { Records } from './pages/Records';
import { Cards } from './pages/Cards';
import { CardEditor } from './pages/CardEditor';
import { Settings } from './pages/Settings';
import { TxnSheet } from './pages/TxnSheet';
import { Icon } from './components/ui';
import type { Transaction } from './types';

type Tab = 'home' | 'records' | 'cards' | 'settings';
type TxnSheetState = { mode: 'add' } | { mode: 'edit'; txn: Transaction } | null;
/** undefined = 關閉；null = 新增卡片 */
type CardEditorState = string | null | undefined;

const TABS: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'home', label: '總覽', icon: 'home' },
  { id: 'records', label: '紀錄', icon: 'list' },
  { id: 'cards', label: '卡片庫', icon: 'card' },
  { id: 'settings', label: '設定', icon: 'gear' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [txnSheet, setTxnSheet] = useState<TxnSheetState>(null);
  const [cardEditor, setCardEditor] = useState<CardEditorState>(undefined);

  const switchTab = (t: Tab): void => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  return (
    <DataProvider>
      <div className="app">
        <main className="content">
          {tab === 'home' && <Dashboard onOpenCard={(id) => setCardEditor(id)} onGoCards={() => switchTab('cards')} />}
          {tab === 'records' && <Records onEditTxn={(txn) => setTxnSheet({ mode: 'edit', txn })} />}
          {tab === 'cards' && <Cards onOpenCard={(id) => setCardEditor(id)} />}
          {tab === 'settings' && <Settings />}
        </main>

        <nav className="tab-bar">
          {TABS.slice(0, 2).map((t) => (
            <TabButton key={t.id} {...t} active={tab === t.id} onClick={() => switchTab(t.id)} />
          ))}
          <button className="fab" onClick={() => setTxnSheet({ mode: 'add' })} aria-label="新增消費">
            <Icon name="plus" size={28} />
          </button>
          {TABS.slice(2).map((t) => (
            <TabButton key={t.id} {...t} active={tab === t.id} onClick={() => switchTab(t.id)} />
          ))}
        </nav>

        {cardEditor !== undefined && <CardEditor key={cardEditor ?? 'new'} cardId={cardEditor} onClose={() => setCardEditor(undefined)} />}

        {txnSheet && (
          <TxnSheet
            key={txnSheet.mode === 'edit' ? txnSheet.txn.id : 'new'}
            editing={txnSheet.mode === 'edit' ? txnSheet.txn : undefined}
            onClose={() => setTxnSheet(null)}
          />
        )}
      </div>
    </DataProvider>
  );
}

function TabButton({ label, icon, active, onClick }: { label: string; icon: Parameters<typeof Icon>[0]['name']; active: boolean; onClick: () => void }) {
  return (
    <button className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon name={icon} size={24} />
      <span>{label}</span>
    </button>
  );
}
