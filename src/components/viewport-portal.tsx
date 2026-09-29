"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Escape app containers whose transforms or overflow would move or clip fixed UI. */
export function ViewportPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.body); }, []);
  return host ? createPortal(children, host) : null;
}
