'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { FoodRecord, TIER_CONFIG } from '../../lib/types';
import { getRecordById, deleteRecord } from '../../lib/storage';

export default function DetailPage() {
  const router = useRouter();
  const params = useParams();
  const [record, setRecord] = useState<FoodRecord | null>(null);

  useEffect(() => {
    const id = params.id as string;
    const found = getRecordById(id);
    if (found) {
      setRecord(found);
    }
  }, [params.id]);

  function handleDelete() {
    if (!record) return;
    if (confirm('确定要删除这条记录吗？')) {
      deleteRecord(record.id);
      router.push('/');
    }
  }

  if (!record) {
    return (
      <>
        <header className="header">
          <button className="header-back" onClick={() => router.push('/')}>
            ← 返回
          </button>
          <span className="header-title">食物详情</span>
          <div style={{ width: 48 }} />
        </header>
        <main className="content">
          <div className="empty-state">
            <span className="empty-icon">🔍</span>
            <p className="empty-text">记录不存在</p>
          </div>
        </main>
      </>
    );
  }

  const date = new Date(record.createdAt);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const tierConfig = TIER_CONFIG[record.tier];

  return (
    <>
      <header className="header">
        <button className="header-back" onClick={() => router.push('/')}>
          ← 返回
        </button>
        <span className="header-title">食物详情</span>
        <div style={{ width: 48 }} />
      </header>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="detail-image"
        src={record.imageBase64}
        alt={record.name}
      />

      <div className="detail-content">
        <h1 className="detail-name">{record.name}</h1>
        <p className="detail-time">
          {dateStr}　·
          <span className="tier-badge" data-tier={record.tier}>
            {tierConfig.label}
          </span>
        </p>

        {record.ingredients.length > 0 && (
          <div className="detail-section">
            <h2 className="detail-section-title">食材</h2>
            <div className="food-card-tags">
              {record.ingredients.map((ing) => (
                <span key={ing} className="tag ingredient">{ing}</span>
              ))}
            </div>
          </div>
        )}

        {record.cookingMethod && (
          <div className="detail-section">
            <h2 className="detail-section-title">烹饪方式</h2>
            <p>{record.cookingMethod}</p>
          </div>
        )}

        {record.tags.length > 0 && (
          <div className="detail-section">
            <h2 className="detail-section-title">标签</h2>
            <div className="food-card-tags">
              {record.tags.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          </div>
        )}

        {record.aiDescription && (
          <div className="detail-section">
            <h2 className="detail-section-title">AI 点评</h2>
            <div className="detail-description">{record.aiDescription}</div>
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <button className="btn btn-danger" onClick={handleDelete}>
            删除记录
          </button>
        </div>
      </div>
    </>
  );
}
