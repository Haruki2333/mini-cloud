'use client';

import { useState, useRef } from 'react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export default function TagInput({ tags, onChange, placeholder = '输入后按回车添加', className }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const newTag = inputValue.trim();
      if (!tags.includes(newTag)) {
        onChange([...tags, newTag]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div
      className={`tag-input-container ${className || ''}`}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`} className="tag-removable">
          {tag}
          <button
            className="tag-remove-btn"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(i);
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="tag-input-field"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
      />
    </div>
  );
}
