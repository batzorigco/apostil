export type ApostilUser = {
  id: string;
  name: string;
  avatar?: string;
  color: string;
};

export type ApostilComment = {
  id: string;
  threadId: string;
  author: ApostilUser;
  body: string;
  createdAt: string;
  taskUpdate?: ApostilTaskUpdate;
};

export type ApostilTaskStatus = "open" | "needs_review" | "completed";
export type ApostilTaskUpdate = {
  status: "needs_review" | "completed";
  /** Verification performed, or the specific checks a human must make. */
  details: string;
};

export type ApostilThread = {
  id: string;
  pageId: string;
  pinX: number;
  pinY: number;
  targetId?: string;
  targetLabel?: string;
  context?: ApostilCaptureContext;
  resolved: boolean;
  /** Optional for older comments; resolved remains the compatibility flag. */
  status?: ApostilTaskStatus;
  comments: ApostilComment[];
  createdAt: string;
};

export type ApostilStorage = {
  load(pageId: string): Promise<ApostilThread[]>;
  save(pageId: string, threads: ApostilThread[]): Promise<void>;
  loadAll?(): Promise<ApostilPage[]>;
};

export type ApostilPage = { pageId: string; threads: ApostilThread[] };

export type ApostilElement = {
  selector: string;
  selectorKind: "stable" | "structural";
  tag: string;
  id?: string;
  classes: string[];
  label?: string;
  text?: string;
  attributes: Record<string, string>;
};

export type ApostilSurface = {
  kind: string;
  element: ApostilElement;
  trigger?: ApostilElement;
};

export type ApostilCaptureContext = {
  version: 1;
  capturedAt: string;
  url: string;
  title: string;
  viewport: { width: number; height: number; scrollX: number; scrollY: number };
  element: ApostilElement;
  anchor: ApostilElement;
  /** Outer to inner, including portal relationships through aria-controls. */
  surfaces: ApostilSurface[];
};

export type ApostilAIProvider = "codex" | "claude";
export type ApostilAIRequest = {
  version: 1;
  requestId: string;
  provider: ApostilAIProvider;
  prompt: string;
};
export type ApostilAIResult = { message: string };
export type ApostilAISender = (request: ApostilAIRequest) => Promise<ApostilAIResult>;
