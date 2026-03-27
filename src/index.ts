// Remarq — Pin-and-comment feedback overlay
// https://github.com/batzorigco/remarq

// Provider & hooks
export { RemarqProvider, useRemarq } from "./context";
export { useComments } from "./hooks/use-comments";
export { useCommentMode } from "./hooks/use-comment-mode";

// Components
export { CommentOverlay } from "./components/comment-overlay";
export { CommentToggle } from "./components/comment-toggle";
export { CommentSidebar } from "./components/comment-sidebar";

// Debug
export { debug } from "./debug";

// Types
export type {
  RemarqUser,
  RemarqComment,
  RemarqThread,
  RemarqStorage,
} from "./types";
