'use client';

import { FoodRecord, TIER_CONFIG } from '../lib/types';

interface FoodCardProps {
  record: FoodRecord;
  onClick: () => void;
}

export default function FoodCard({ record, onClick }: FoodCardProps) {
  const date = new Date(record.createdAt);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="food-card" onClick={onClick}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="food-card-image"
        src={record.imageBase64}
        alt={record.name}
      />
      <div className="food-card-body">
        <div className="food-card-name">{record.name}</div>
        <div className="food-card-tags">
          {record.ingredients.slice(0, 4).map((ing) => (
            <span key={ing} className="tag ingredient">
              {ing}
            </span>
          ))}
          {record.tags.slice(0, 2).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
        <div className="food-card-meta">
          <span>{dateStr}</span>
          <span className="tier-badge" data-tier={record.tier}>
            {TIER_CONFIG[record.tier].label}
          </span>
        </div>
      </div>
    </div>
  );
}
