export declare const TRANSCRIPT_LIMIT = 40;
export declare const TRANSCRIPT_TEXT = 4000;
export interface TranscriptMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    tools?: string[];
}
/** User and assistant turns from a derived session history. Tool arguments and other roles stay out. */
export declare function projectTranscript(messages: unknown, limit?: number): TranscriptMessage[];
export type ChatRow = {
    kind: 'message';
    id: string;
    role: 'user' | 'assistant';
    text: string;
} | {
    kind: 'tools';
    id: string;
    names: string[];
};
export interface ChatSession {
    id: string;
    title: string;
    blank: boolean;
    running: boolean;
    updatedAt: number;
}
/** Sessions that belong to the current workspace, newest first. The open session stays even if the list has not caught up. */
export declare function chatSessionView(sessions: unknown, workspaces: unknown, currentId: string | null, cwd?: string): {
    sessions: ChatSession[];
    workspaceId?: string;
};
/** Fold a run of tool-only turns into one chip row so the log is not a stack of empty messages. */
export declare function chatRows(messages: TranscriptMessage[]): ChatRow[];
/** Accept the projected wire payload. Raw session messages are not a transcript. */
export declare function readTranscript(value: unknown): TranscriptMessage[] | null;
/** Send one message through the session composer. Replaces the draft, then submits it. */
export declare function sendConversation(inputActions: {
    setDraft?: (text: string) => void;
    persistDraft?: () => void;
    submit?: () => void;
    send?: (text: string) => unknown;
} | null | undefined, text: string): boolean;
