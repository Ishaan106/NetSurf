/**
 * Message types for the Deep Research UI
 * Adapted from ai-browser's message model, kept minimal for performance
 */

// ─── Tool types ──────────────────────────────────────────────────────

export type ToolParams = Record<string, unknown>;

export interface ToolAction {
    id: string;
    toolName: string;
    type: 'tool';
    params?: ToolParams;
    status: 'streaming' | 'use' | 'running' | 'completed';
    result?: any;
    timestamp: Date;
    agentName: string;
}

export interface TextMessage {
    type: 'text';
    id: string;
    content: string;
}

export interface ThinkingMessage {
    type: 'thinking';
    id: string;
    content: string;
    completed: boolean;
}

export type AgentMessage = ToolAction | TextMessage | ThinkingMessage;

// ─── Display messages ────────────────────────────────────────────────

export interface WorkflowMessage {
    id: string;
    type: 'workflow';
    taskId: string;
    workflow?: Record<string, unknown>;
    thinking?: {
        text: string;
        completed: boolean;
    };
    confirmId?: string;
    confirmStatus?: 'pending' | 'confirmed' | 'regenerating';
    timestamp: Date;
}

export interface AgentGroupMessage {
    id: string;
    type: 'agent_group';
    taskId: string;
    agentName: string;
    agentNode?: any;
    messages: AgentMessage[];
    result?: string;
    status: 'running' | 'completed' | 'error';
    timestamp: Date;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface UserMessage {
    id: string;
    type: 'user';
    content: string;
    timestamp: Date;
}

export interface ChatResponseMessage {
    id: string;
    type: 'chat';
    chatId: string;
    content: string;
    tools: ToolAction[];
    thinkings: ThinkingMessage[];
    status: 'running' | 'completed' | 'error';
    error?: string;
    duration?: number;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    timestamp: Date;
}

export interface ErrorMessage {
    id: string;
    type: 'error';
    error: string;
    detail?: string;
    taskId?: string;
    timestamp: Date;
}

export type DisplayMessage =
    | WorkflowMessage
    | AgentGroupMessage
    | UserMessage
    | ChatResponseMessage
    | ErrorMessage;

// ─── Task types ──────────────────────────────────────────────────────

export type TaskMode = 'explore' | 'chat';
export type TaskStatus = 'idle' | 'running' | 'done' | 'error';

export interface Task {
    id: string;
    name: string;
    messages: DisplayMessage[];
    status: TaskStatus;
    taskMode: TaskMode;
    workflow?: any;
    contextParams?: Record<string, any>;
    chainPlanRequest?: any;
    chainPlanResult?: string;
    toolHistory?: ToolHistoryEntry[];
    createdAt: Date;
    updatedAt: Date;
}

export interface ToolHistoryEntry {
    url: string;
    toolName: string;
    operation: string;
    timestamp: Date;
}

// ─── Human interaction ───────────────────────────────────────────────

export interface HumanInteractionMessage {
    type: 'human_interaction';
    requestId: string;
    taskId?: string;
    agentName?: string;
    interactType: 'confirm' | 'input' | 'select' | 'request_help';
    prompt: string;
    helpType?: 'request_login' | 'request_assistance';
    selectOptions?: string[];
    selectMultiple?: boolean;
    context?: { siteName?: string; actionUrl?: string };
    timestamp: Date;
}
