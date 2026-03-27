const PREFIX = "[apostil]";

function isDebug(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("apostil-debug") === "true";
  } catch {
    return false;
  }
}

export const debug = {
  log(...args: unknown[]) {
    if (isDebug()) console.log(PREFIX, ...args);
  },
  warn(...args: unknown[]) {
    if (isDebug()) console.warn(PREFIX, ...args);
  },
  error(...args: unknown[]) {
    console.error(PREFIX, ...args);
  },
  /** Enable/disable debug logging */
  enable() {
    if (typeof window !== "undefined") {
      localStorage.setItem("apostil-debug", "true");
      console.log(PREFIX, "debug logging enabled — reload to take effect");
    }
  },
  disable() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("apostil-debug");
      console.log(PREFIX, "debug logging disabled");
    }
  },
};

// Expose globally for easy toggling from console
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__apostil_debug = debug;
}
