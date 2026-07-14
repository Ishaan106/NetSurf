/**
 * MessageProcessor — Transforms raw Eko stream messages into display messages
 * 
 * Processes the stream of StreamCallbackMessage events from the backend
 * and maintains an ordered array of DisplayMessage for the UI.
 * 
 * Adapted from ai-browser's messageTransform.ts, simplified for performance.
 */

import type {
    DisplayMessage,
    WorkflowMessage,
    AgentGroupMessage,
    ChatResponseMessage,
    ErrorMessage,
    ToolAction,
    TextMessage,
    ThinkingMessage,
} from '../types/messages';

let idCounter = 0;
function genId(): string {
    return `msg_${++idCounter}_${Date.now()}`;
}

export class MessageProcessor {
    private messages: DisplayMessage[] = [];
    private currentAgentGroup: AgentGroupMessage | null = null;
    private currentWorkflow: WorkflowMessage | null = null;
    private currentChat: ChatResponseMessage | null = null;
    // Track streaming tools by their toolCallId to merge streaming → result
    private streamingTools = new Map<string, ToolAction>();

    getMessages(): DisplayMessage[] {
        return this.messages;
    }

    setMessages(msgs: DisplayMessage[]): void {
        this.messages = [...msgs];
    }

    reset(): void {
        this.messages = [];
        this.currentAgentGroup = null;
        this.currentWorkflow = null;
        this.currentChat = null;
        this.streamingTools.clear();
    }

    /**
     * Process a raw eko-stream-message event.
     * Returns true if the message list was modified.
     */
    processMessage(raw: any): boolean {
        const type = raw.type as string;
        if (!type) return false;

        switch (type) {
            // ── Workflow planning ────────────────────────────
            case 'workflow':
                return this.handleWorkflow(raw);

            case 'workflow_confirm':
                return this.handleWorkflowConfirm(raw);

            // ── Agent lifecycle ──────────────────────────────
            case 'agent_start':
                return this.handleAgentStart(raw);

            case 'agent_result':
                return this.handleAgentResult(raw);

            // ── Thinking ────────────────────────────────────
            case 'thinking':
                return this.handleThinking(raw);

            // ── Text output ─────────────────────────────────
            case 'text':
                return this.handleText(raw);

            // ── Tool calls ──────────────────────────────────
            case 'tool_streaming':
                return this.handleToolStreaming(raw);

            case 'tool_use':
                return this.handleToolUse(raw);

            case 'tool_result':
                return this.handleToolResult(raw);

            // ── Chat mode ───────────────────────────────────
            case 'chat_text':
                return this.handleChatText(raw);

            case 'chat_tool_use':
                return this.handleChatToolUse(raw);

            case 'chat_tool_result':
                return this.handleChatToolResult(raw);

            case 'chat_thinking':
                return this.handleChatThinking(raw);

            case 'chat_done':
                return this.handleChatDone(raw);

            // ── Error ───────────────────────────────────────
            case 'error':
                return this.handleError(raw);

            // ── Human interaction ───────────────────────────
            case 'human_interaction':
                return this.handleHumanInteraction(raw);

            case 'human_interaction_result':
                // Handled by UI directly
                return false;

            default:
                return false;
        }
    }

    // ── Handlers ─────────────────────────────────────────────────────────

    private handleWorkflow(raw: any): boolean {
        if (!this.currentWorkflow) {
            this.currentWorkflow = {
                id: genId(),
                type: 'workflow',
                taskId: raw.taskId || '',
                timestamp: new Date(),
            };
            this.messages.push(this.currentWorkflow);
        }

        if (raw.workflow) {
            this.currentWorkflow.workflow = raw.workflow;
        }
        if (raw.thinking !== undefined) {
            const thinking = this.currentWorkflow.thinking || { text: '', completed: false };
            thinking.text += (raw.thinking || '');
            if (raw.streamDone) thinking.completed = true;
            this.currentWorkflow.thinking = thinking;
        }
        if (raw.streamDone && raw.workflow) {
            this.currentWorkflow.workflow = raw.workflow;
        }

        return true;
    }

    private handleWorkflowConfirm(raw: any): boolean {
        if (this.currentWorkflow) {
            this.currentWorkflow.confirmId = raw.confirmId;
            this.currentWorkflow.confirmStatus = 'pending';
            this.currentWorkflow.workflow = raw.workflow;
        }
        return true;
    }

    private handleAgentStart(raw: any): boolean {
        // Close previous agent group
        if (this.currentAgentGroup && this.currentAgentGroup.status === 'running') {
            this.currentAgentGroup.status = 'completed';
        }

        this.currentAgentGroup = {
            id: genId(),
            type: 'agent_group',
            taskId: raw.taskId || '',
            agentName: raw.agentNode?.name || raw.agentName || 'Agent',
            agentNode: raw.agentNode,
            messages: [],
            status: 'running',
            timestamp: new Date(),
        };
        this.messages.push(this.currentAgentGroup);
        this.streamingTools.clear();
        return true;
    }

    private handleAgentResult(raw: any): boolean {
        if (this.currentAgentGroup) {
            this.currentAgentGroup.status = 'completed';
            this.currentAgentGroup.result = raw.result;
            if (raw.usage) {
                this.currentAgentGroup.usage = raw.usage;
            }
        }
        return true;
    }

    private handleThinking(raw: any): boolean {
        if (!this.currentAgentGroup) return false;

        const streamId = raw.streamId || 'thinking';
        // Find or create thinking message
        let thinking = this.currentAgentGroup.messages.find(
            (m): m is ThinkingMessage => m.type === 'thinking' && m.id === streamId,
        );

        if (!thinking) {
            thinking = { type: 'thinking', id: streamId, content: '', completed: false };
            this.currentAgentGroup.messages.push(thinking);
        }

        thinking.content += (raw.thinking || raw.text || '');
        if (raw.streamDone) thinking.completed = true;

        return true;
    }

    private handleText(raw: any): boolean {
        if (!this.currentAgentGroup) return false;

        const streamId = raw.streamId || genId();
        let text = this.currentAgentGroup.messages.find(
            (m): m is TextMessage => m.type === 'text' && m.id === streamId,
        );

        if (!text) {
            text = { type: 'text', id: streamId, content: '' };
            this.currentAgentGroup.messages.push(text);
        }

        text.content += (raw.text || '');
        return true;
    }

    private handleToolStreaming(raw: any): boolean {
        if (!this.currentAgentGroup) return false;

        const toolCallId = raw.toolCallId || genId();
        let tool = this.streamingTools.get(toolCallId);

        if (!tool) {
            tool = {
                id: toolCallId,
                toolName: raw.toolName || 'unknown',
                type: 'tool',
                status: 'streaming',
                timestamp: new Date(),
                agentName: this.currentAgentGroup.agentName,
            };
            this.streamingTools.set(toolCallId, tool);
            this.currentAgentGroup.messages.push(tool);
        }

        // Build params from streaming text
        if (raw.paramsText) {
            try {
                tool.params = JSON.parse(raw.paramsText);
            } catch {
                // Partial JSON, ignore
            }
        }

        return true;
    }

    private handleToolUse(raw: any): boolean {
        if (!this.currentAgentGroup) return false;

        const toolCallId = raw.toolCallId || genId();
        let tool = this.streamingTools.get(toolCallId);

        if (tool) {
            // Upgrade streaming → use
            tool.status = 'running';
            tool.params = raw.params;
        } else {
            tool = {
                id: toolCallId,
                toolName: raw.toolName || 'unknown',
                type: 'tool',
                params: raw.params,
                status: 'running',
                timestamp: new Date(),
                agentName: this.currentAgentGroup.agentName,
            };
            this.streamingTools.set(toolCallId, tool);
            this.currentAgentGroup.messages.push(tool);
        }

        return true;
    }

    private handleToolResult(raw: any): boolean {
        if (!this.currentAgentGroup) return false;

        const toolCallId = raw.toolCallId;
        const tool = toolCallId ? this.streamingTools.get(toolCallId) : undefined;

        if (tool) {
            tool.status = 'completed';
            tool.result = raw.toolResult;
        }

        return true;
    }

    // ── Chat mode handlers ───────────────────────────────────────────────

    private ensureChatMessage(raw: any): ChatResponseMessage {
        if (!this.currentChat) {
            this.currentChat = {
                id: raw.messageId || genId(),
                type: 'chat',
                chatId: raw.chatId || '',
                content: '',
                tools: [],
                thinkings: [],
                status: 'running',
                timestamp: new Date(),
            };
            this.messages.push(this.currentChat);
        }
        return this.currentChat;
    }

    private handleChatText(raw: any): boolean {
        const chat = this.ensureChatMessage(raw);
        chat.content += (raw.text || '');
        return true;
    }

    private handleChatToolUse(raw: any): boolean {
        const chat = this.ensureChatMessage(raw);
        const tool: ToolAction = {
            id: raw.toolCallId || genId(),
            toolName: raw.toolName || 'unknown',
            type: 'tool',
            params: raw.params,
            status: 'running',
            timestamp: new Date(),
            agentName: 'Chat',
        };
        chat.tools.push(tool);
        return true;
    }

    private handleChatToolResult(raw: any): boolean {
        const chat = this.ensureChatMessage(raw);
        const tool = chat.tools.find(t => t.id === raw.toolCallId);
        if (tool) {
            tool.status = 'completed';
            tool.result = raw.toolResult;
        }
        return true;
    }

    private handleChatThinking(raw: any): boolean {
        const chat = this.ensureChatMessage(raw);
        const streamId = raw.streamId || 'chat-thinking';

        let thinking = chat.thinkings.find(t => t.id === streamId);
        if (!thinking) {
            thinking = { type: 'thinking', id: streamId, content: '', completed: false };
            chat.thinkings.push(thinking);
        }
        thinking.content += (raw.thinking || raw.text || '');
        if (raw.streamDone) thinking.completed = true;

        return true;
    }

    private handleChatDone(raw: any): boolean {
        if (this.currentChat) {
            this.currentChat.status = 'completed';
            if (raw.usage) this.currentChat.usage = raw.usage;
            if (raw.duration) this.currentChat.duration = raw.duration;
            this.currentChat = null; // Allow new chat messages
        }
        return true;
    }

    // ── Error & human interaction ────────────────────────────────────────

    private handleError(raw: any): boolean {
        const error: ErrorMessage = {
            id: genId(),
            type: 'error',
            error: raw.error || 'Unknown error',
            detail: raw.detail,
            taskId: raw.taskId,
            timestamp: new Date(),
        };
        this.messages.push(error);
        return true;
    }

    private handleHumanInteraction(_raw: any): boolean {
        // Human interaction messages are forwarded to the UI as-is
        // They're handled separately in the component, not as DisplayMessages
        return false;
    }
}
