import { FoodRecord, UserSettings, Tier } from './types';

const RECORDS_KEY = 'food-tracker-records';
const SETTINGS_KEY = 'food-tracker-settings';

const defaultSettings: UserSettings = {
  tier: 1,
  apiKeys: {},
};

export function getRecords(): FoodRecord[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(RECORDS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as FoodRecord[];
  } catch {
    return [];
  }
}

export function saveRecord(record: FoodRecord): void {
  const records = getRecords();
  records.unshift(record);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

export function getRecordById(id: string): FoodRecord | undefined {
  return getRecords().find((r) => r.id === id);
}

export function deleteRecord(id: string): void {
  const records = getRecords().filter((r) => r.id !== id);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

export function getSettings(): UserSettings {
  if (typeof window === 'undefined') return defaultSettings;
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;
  try {
    return JSON.parse(raw) as UserSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: UserSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function setTier(tier: Tier): void {
  const settings = getSettings();
  settings.tier = tier;
  saveSettings(settings);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
