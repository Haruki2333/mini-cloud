'use client';

import { Tier, TIER_CONFIG } from '../lib/types';

interface TierSwitchProps {
  tier: Tier;
  onChange: (tier: Tier) => void;
}

export default function TierSwitch({ tier, onChange }: TierSwitchProps) {
  const tiers: Tier[] = [1, 2, 3];

  return (
    <div className="tier-switch">
      {tiers.map((t) => (
        <button
          key={t}
          className={`tier-btn ${tier === t ? 'active' : ''}`}
          data-tier={t}
          onClick={() => onChange(t)}
        >
          {TIER_CONFIG[t].label}
        </button>
      ))}
    </div>
  );
}
