type ApostilUser = {
    id: string;
    name: string;
    avatar?: string;
    color: string;
};
type ApostilComment = {
    id: string;
    threadId: string;
    author: ApostilUser;
    body: string;
    createdAt: string;
};
type ApostilThread = {
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
type ApostilStorage = {
    load(pageId: string): Promise<ApostilThread[]>;
    save(pageId: string, threads: ApostilThread[]): Promise<void>;
};

export type { ApostilStorage as A, ApostilThread as a, ApostilUser as b, ApostilComment as c };
