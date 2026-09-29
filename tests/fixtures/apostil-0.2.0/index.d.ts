import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { A as ApostilStorage, a as ApostilThread, b as ApostilUser } from './types-oQRt3lYH.js';
export { c as ApostilComment } from './types-oQRt3lYH.js';

type ApostilContextValue = {
    threads: ApostilThread[];
    user: ApostilUser | null;
    commentMode: boolean;
    activeThreadId: string | null;
    sidebarOpen: boolean;
    brandColor: string;
    setCommentMode: (on: boolean) => void;
    setActiveThreadId: (id: string | null) => void;
    setSidebarOpen: (open: boolean) => void;
    addThread: (pinX: number, pinY: number, body: string, targetId?: string, targetLabel?: string) => void;
    addReply: (threadId: string, body: string) => void;
    resolveThread: (threadId: string) => void;
    deleteThread: (threadId: string) => void;
    setUser: (name: string) => void;
    unresolvedCount: number;
};
declare function ApostilProvider({ pageId, storage, brandColor, children, }: {
    pageId: string;
    storage?: ApostilStorage;
    brandColor?: string;
    children: ReactNode;
}): react_jsx_runtime.JSX.Element;
declare function useApostil(): ApostilContextValue;

declare function useComments(): {
    threads: ApostilThread[];
    openThreads: ApostilThread[];
    resolvedThreads: ApostilThread[];
    addThread: (pinX: number, pinY: number, body: string, targetId?: string, targetLabel?: string) => void;
    addReply: (threadId: string, body: string) => void;
    resolveThread: (threadId: string) => void;
    deleteThread: (threadId: string) => void;
    unresolvedCount: number;
};

declare function useCommentMode(): {
    commentMode: boolean;
    setCommentMode: (on: boolean) => void;
    toggleCommentMode: () => void;
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
};

declare function CommentOverlay(): react_jsx_runtime.JSX.Element;

declare function CommentToggle(): react_jsx_runtime.JSX.Element;

declare function CommentSidebar(): react_jsx_runtime.JSX.Element | null;

declare const debug: {
    log(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    /** Enable/disable debug logging */
    enable(): void;
    disable(): void;
};

export { ApostilProvider, ApostilStorage, ApostilThread, ApostilUser, CommentOverlay, CommentSidebar, CommentToggle, debug, useApostil, useCommentMode, useComments };
