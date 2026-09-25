"use client";

import { useEffect, useState } from "react";

/** 「我的订阅」只存在本地（PRD P0-3：不登录时存浏览器）。读写失败时退化为内存状态。 */
export function useStoredSet(key: string): [Set<string>, (next: Set<string>) => void, boolean] {
  const [value, setValue] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setValue(new Set(JSON.parse(raw) as string[]));
    } catch {
      // 隐私模式或存储被禁用：忽略。
    }
    setLoaded(true);
  }, [key]);

  const update = (next: Set<string>) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, JSON.stringify([...next]));
    } catch {
      // 同上。
    }
  };

  return [value, update, loaded];
}

export const MINE_KEY = "ai-plan-tracker:mine";
export const PRIMARY_KEY = "ai-plan-tracker:primary";
