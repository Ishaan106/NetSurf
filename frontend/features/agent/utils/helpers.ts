export const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function textFrom(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function labelForTool(toolName: string): string {
    return toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function extractWorkflowAgents(workflow: any): Array<{ name: string; task: string; steps: string[] }> {
    const agents = Array.isArray(workflow?.agents) ? workflow.agents : [];
    return agents.map((agent: any, index: number) => {
        const nodes = Array.isArray(agent.nodes) ? agent.nodes : [];
        const steps = nodes
            .map((node: any) => node.text || node.action || node.task || node.name || '')
            .filter(Boolean);
        return {
            name: agent.name || agent.agent || `Agent ${index + 1}`,
            task: agent.task || agent.thought || agent.description || '',
            steps,
        };
    });
}

export function extractXmlSections(content: string): Array<{ tag: string; body: string }> {
    const sections: Array<{ tag: string; body: string }> = [];
    const xmlPattern = /<([a-zA-Z][\w:-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
    let match: RegExpExecArray | null;
    while ((match = xmlPattern.exec(content)) !== null) {
        const body = match[2].trim();
        if (body) sections.push({ tag: match[1], body });
    }
    return sections.slice(0, 12);
}

export function normalizeForDedupe(text: string): string {
    return (text || '').replace(/\s+/g, ' ').trim();
}

export function formatJson(value: unknown): string {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function domainFor(value?: string): string {
    if (!value || value === 'about:blank') return 'New Tab';
    try {
        return new URL(value).hostname.replace(/^www\./, '');
    } catch {
        return value.startsWith('workspace:') ? 'Agent workspace' : value;
    }
}
