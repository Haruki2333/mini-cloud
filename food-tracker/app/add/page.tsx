'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Tier, TIER_CONFIG } from '../lib/types';
import { getSettings, saveRecord, generateId } from '../lib/storage';
import PhotoUpload from '../components/PhotoUpload';
import TagInput from '../components/TagInput';

type AiStatus = 'idle' | 'loading' | 'success' | 'error';

export default function AddPage() {
  const router = useRouter();
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [cookingMethod, setCookingMethod] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [aiDescription, setAiDescription] = useState('');
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiError, setAiError] = useState('');
  const [tier, setTier] = useState<Tier>(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTier(getSettings().tier);
  }, []);

  async function handleImageSelected(base64: string) {
    setImageBase64(base64);
    await recognizeFood(base64);
  }

  async function recognizeFood(base64: string) {
    const settings = getSettings();
    const currentTier = settings.tier;
    const config = TIER_CONFIG[currentTier];
    const apiKey = settings.apiKeys[config.provider as keyof typeof settings.apiKeys];

    if (!apiKey) {
      setAiStatus('error');
      setAiError(`请先在设置页面配置 ${config.label} 的 API Key`);
      return;
    }

    setAiStatus('loading');
    setAiError('');

    try {
      const res = await fetch('/api/recognize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({ imageBase64: base64, tier: currentTier }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '识别失败');
      }

      const data = await res.json();
      setName(data.name || '');
      setIngredients(data.ingredients || []);
      setCookingMethod(data.cookingMethod || '');
      setTags(data.tags || []);
      setAiDescription(data.description || '');
      setAiStatus('success');
    } catch (err) {
      setAiStatus('error');
      setAiError(err instanceof Error ? err.message : '识别失败，请重试');
    }
  }

  function handleSave() {
    if (!imageBase64 || !name.trim()) return;
    setSaving(true);

    saveRecord({
      id: generateId(),
      imageBase64,
      name: name.trim(),
      ingredients,
      cookingMethod: cookingMethod.trim(),
      tags,
      aiDescription,
      tier,
      createdAt: new Date().toISOString(),
    });

    router.push('/');
  }

  return (
    <>
      <header className="header">
        <button className="header-back" onClick={() => router.back()}>
          ← 返回
        </button>
        <span className="header-title">新增记录</span>
        <div style={{ width: 48 }} />
      </header>

      <main className="content">
        <div className="form-group">
          <PhotoUpload
            imageBase64={imageBase64}
            onImageSelected={handleImageSelected}
          />
        </div>

        {aiStatus === 'loading' && (
          <div className="ai-status loading">
            <span className="ai-spinner" />
            AI 识别中...（{TIER_CONFIG[tier].label}）
          </div>
        )}

        {aiStatus === 'success' && (
          <div className="ai-status success">
            ✓ AI 识别完成，可手动修改
          </div>
        )}

        {aiStatus === 'error' && (
          <div className="ai-status error">
            ✗ {aiError}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">菜名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入菜名"
          />
        </div>

        <div className="form-group">
          <label className="form-label">食材</label>
          <TagInput
            tags={ingredients}
            onChange={setIngredients}
            placeholder="输入食材后按回车"
          />
        </div>

        <div className="form-group">
          <label className="form-label">烹饪方式</label>
          <input
            value={cookingMethod}
            onChange={(e) => setCookingMethod(e.target.value)}
            placeholder="如：红烧、清蒸、爆炒"
          />
        </div>

        <div className="form-group">
          <label className="form-label">标签</label>
          <TagInput
            tags={tags}
            onChange={setTags}
            placeholder="输入标签后按回车"
          />
        </div>

        {aiDescription && (
          <div className="form-group">
            <label className="form-label">AI 描述</label>
            <div className="detail-description">{aiDescription}</div>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!imageBase64 || !name.trim() || saving}
        >
          {saving ? '保存中...' : '保存记录'}
        </button>
      </main>
    </>
  );
}
