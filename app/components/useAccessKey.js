"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "brief_access_key";

export function useAccessKey() {
  const [key, setKeyState] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setKeyState(saved);
    } catch {
      /* private browsing */
    }
    setReady(true);
  }, []);

  const setKey = useCallback((value) => {
    setKeyState(value);
    try {
      if (value.trim()) localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { key, setKey, ready };
}
