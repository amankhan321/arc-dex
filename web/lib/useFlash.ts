"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns a flash class when `value` changes — "flash-up" if it rose,
 * "flash-down" if it fell — then clears it. For live numbers that should
 * tick like an exchange.
 */
export function useFlash(value: number | undefined): string {
  const prev = useRef<number | undefined>(value);
  const [cls, setCls] = useState("");

  useEffect(() => {
    if (value == null || prev.current == null) {
      prev.current = value;
      return;
    }
    if (value !== prev.current) {
      setCls(value > prev.current ? "flash-up" : "flash-down");
      prev.current = value;
      const id = setTimeout(() => setCls(""), 600);
      return () => clearTimeout(id);
    }
  }, [value]);

  return cls;
}
