'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FoodRecord, Tier } from './lib/types';
import { getRecords, getSettings, setTier } from './lib/storage';
import FoodCard from './components/FoodCard';
import TierSwitch from './components/TierSwitch';

export default function HomePage() {
  const router = useRouter();
  const [records, setRecords] = useState<FoodRecord[]>([]);
  const [currentTier, setCurrentTier] = useState<Tier>(1);

  useEffect(() => {
    setRecords(getRecords());
    setCurrentTier(getSettings().tier);
  }, []);

  function handleTierChange(tier: Tier) {
    setCurrentTier(tier);
    setTier(tier);
  }

  return (
    <>
      <header className="header">
        <span className="header-title">食物记录</span>
        <div className="header-actions">
          <TierSwitch tier={currentTier} onChange={handleTierChange} />
          <button
            className="settings-icon"
            onClick={() => router.push('/settings')}
            aria-label="设置"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="content">
        {records.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🍽️</span>
            <p className="empty-text">还没有记录</p>
            <p className="empty-hint">点击下方按钮记录你的第一道菜</p>
          </div>
        ) : (
          records.map((record) => (
            <FoodCard
              key={record.id}
              record={record}
              onClick={() => router.push(`/detail/${record.id}`)}
            />
          ))
        )}
      </main>

      <button
        className="fab"
        onClick={() => router.push('/add')}
        aria-label="记录新食物"
      >
        +
      </button>
    </>
  );
}
