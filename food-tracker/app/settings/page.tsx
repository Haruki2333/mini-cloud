'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserSettings } from '../lib/types';
import { getSettings, saveSettings } from '../lib/storage';

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings>({
    tier: 1,
    apiKeys: {},
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  function handleKeyChange(provider: 'zhipu' | 'gemini' | 'openai', value: string) {
    setSettings((prev) => ({
      ...prev,
      apiKeys: { ...prev.apiKeys, [provider]: value },
    }));
    setSaved(false);
  }

  function handleSave() {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <header className="header">
        <button className="header-back" onClick={() => router.back()}>
          ← 返回
        </button>
        <span className="header-title">设置</span>
        <div style={{ width: 48 }} />
      </header>

      <main className="content">
        <div className="settings-section">
          <h2 className="settings-section-title">API Key 配置</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            API Key 仅存储在本地浏览器中，不会上传到服务器
          </p>

          <div className="settings-item">
            <label className="settings-item-label">
              智谱 API Key（体验版 · GLM-4V）
            </label>
            <input
              type="password"
              value={settings.apiKeys.zhipu || ''}
              onChange={(e) => handleKeyChange('zhipu', e.target.value)}
              placeholder="输入智谱 API Key"
            />
          </div>

          <div className="settings-item">
            <label className="settings-item-label">
              Gemini API Key（标准版 · Gemini 2.0 Flash）
            </label>
            <input
              type="password"
              value={settings.apiKeys.gemini || ''}
              onChange={(e) => handleKeyChange('gemini', e.target.value)}
              placeholder="输入 Google AI API Key"
            />
          </div>

          <div className="settings-item">
            <label className="settings-item-label">
              OpenAI API Key（高级版 · GPT-4o）
            </label>
            <input
              type="password"
              value={settings.apiKeys.openai || ''}
              onChange={(e) => handleKeyChange('openai', e.target.value)}
              placeholder="输入 OpenAI API Key"
            />
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? '已保存 ✓' : '保存设置'}
        </button>
      </main>
    </>
  );
}
