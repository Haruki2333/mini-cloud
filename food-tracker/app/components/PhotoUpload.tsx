'use client';

import { useRef } from 'react';

interface PhotoUploadProps {
  imageBase64: string | null;
  onImageSelected: (base64: string) => void;
}

export default function PhotoUpload({ imageBase64, onImageSelected }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    inputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 压缩图片到合理大小
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        onImageSelected(base64);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div
      className={`upload-area ${imageBase64 ? 'has-image' : ''}`}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      {imageBase64 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageBase64} alt="已选择的食物照片" />
      ) : (
        <>
          <span className="upload-icon">📷</span>
          <span className="upload-text">点击拍照或选择图片</span>
        </>
      )}
    </div>
  );
}
