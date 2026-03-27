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
};

export type ApostilThread = {
  id: string;
  pageId: string;
  pinX: number;
  pinY: number;
  targetId?: string;
  targetLabel?: string;
  resolved: boolean;
  comments: ApostilComment[];
  createdAt: string;
};

export type ApostilStorage = {
  load(pageId: string): Promise<ApostilThread[]>;
  save(pageId: string, threads: ApostilThread[]): Promise<void>;
};
