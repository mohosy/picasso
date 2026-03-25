"use client";

import Image from "next/image";
import { useState, useRef, FormEvent, useEffect, KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

interface InputBarProps {
  onSubmit: (query: string, image?: string, thinking?: boolean) => void;
  isLoading: boolean;
}

export default function InputBar({ onSubmit, isLoading }: InputBarProps) {
  const [query, setQuery] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [query]);

  // Close expanded area when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleImageUpload(file: File) {
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);

      const img = new globalThis.Image();
      img.onload = () => {
        const MAX_SIZE = 1024;
        let { width, height } = img;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height / width) * MAX_SIZE);
            width = MAX_SIZE;
          } else {
            width = Math.round((width / height) * MAX_SIZE);
            height = MAX_SIZE;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", 0.8);
        setImageBase64(compressed.split(",")[1]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function doSubmit() {
    if ((!query.trim() && !imageBase64) || isLoading) return;
    onSubmit(query.trim(), imageBase64 || undefined, thinking || undefined);
    setQuery("");
    clearImage();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    doSubmit();
  }

  function clearImage() {
    setImagePreview(null);
    setImageBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
    }
  }

  function handleInputRowMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    setIsFocused(true);

    const target = e.target as HTMLElement;
    if (target.closest("button") || target === textareaRef.current) {
      return;
    }

    e.preventDefault();
    textareaRef.current?.focus();
  }

  return (
    <div ref={containerRef} className="w-full">
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col gap-3">
        {/* Image preview */}
        {imagePreview && (
          <div className="relative inline-block">
            <Image
              src={imagePreview}
              alt="Upload preview"
              width={80}
              height={80}
              unoptimized
              className="h-20 rounded-lg border border-gray-200 object-cover"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-600 hover:bg-gray-300"
            >
              x
            </button>
          </div>
        )}

        {/* Input container with expandable bottom */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg focus-within:border-gray-300 dark:focus-within:border-gray-600 focus-within:shadow-xl transition-all overflow-hidden">
          {/* Input row */}
          <div
            className="flex items-center gap-2 px-4 py-3"
            onMouseDown={handleInputRowMouseDown}
          >
            {/* Image upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 self-center text-gray-300 hover:text-gray-500 transition-colors"
              title="Upload an image"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
              className="hidden"
            />

            {/* Text input */}
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              placeholder="Ask anything..."
              rows={1}
              className="max-h-40 min-h-[28px] flex-1 resize-none overflow-y-auto bg-transparent py-0.5 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
              disabled={isLoading}
            />

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading || (!query.trim() && !imageBase64)}
              className="flex-shrink-0 self-end flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 transition-all hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-20 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22 11 13 2 9z" />
                </svg>
              )}
            </button>
          </div>

          {/* Expandable options row */}
          <div
            className="overflow-hidden transition-all duration-200 ease-out"
            style={{
              maxHeight: isFocused ? 48 : 0,
              opacity: isFocused ? 1 : 0,
            }}
          >
            <div className="flex items-center gap-2 px-4 pb-3 pt-0">
              <button
                type="button"
                onClick={() => setThinking((t) => !t)}
                className={`
                  relative overflow-hidden rounded-full border px-3 py-1.5 text-xs font-medium
                  transition-[color,border-color,transform,background-color,box-shadow] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.985]
                  ${thinking
                    ? "border-black text-white shadow-[0_6px_18px_rgba(17,24,39,0.14)] dark:border-white dark:text-black dark:shadow-[0_6px_18px_rgba(255,255,255,0.10)]"
                    : "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-500 dark:hover:text-gray-400"
                  }
                `}
              >
                <span
                  aria-hidden="true"
                  className={`
                    absolute inset-0 rounded-full bg-black dark:bg-white
                    transition-[width,opacity] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]
                    ${thinking ? "w-full opacity-100" : "w-6 opacity-0"}
                  `}
                />
                <span className="relative z-10 flex items-center gap-1.5 transition-transform duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <Image
                    src="/brain1.png"
                    alt=""
                    width={14}
                    height={14}
                    className={`h-3.5 w-3.5 object-contain transition-[filter,opacity] duration-300 ${thinking ? "opacity-100 brightness-0 invert dark:brightness-100 dark:invert-0" : "opacity-70"}`}
                    priority
                  />
                  Think
                  {thinking && (
                    <span className="flex h-1.5 w-1.5 rounded-full bg-white dark:bg-black" />
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
    </div>
  );
}
