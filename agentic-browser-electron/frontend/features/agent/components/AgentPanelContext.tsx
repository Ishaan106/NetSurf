import { Compass, Globe } from 'lucide-react';
import { domainFor } from '../utils/helpers';

interface AgentPanelContextProps {
    activeTab?: {
        title?: string;
        url?: string;
        favicon?: string;
    };
    activeWorkspaceName?: string;
    activeWorkspaceTabCount: number;
    screenshotEnabled: boolean;
}

export function AgentPanelContext({
    activeTab,
    activeWorkspaceName = 'Workspace',
    activeWorkspaceTabCount,
    screenshotEnabled
}: AgentPanelContextProps) {
    return (
        <div className="ap-context">
            <div className="ap-context-label">
                <Compass className="h-3.5 w-3.5" />
                Browsing context
            </div>
            <div className="ap-context-page">
                <span className="ap-context-favicon">
                    {activeTab?.favicon ? <img src={activeTab.favicon} alt="" /> : <Globe className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="ap-context-title" title={activeTab?.title || activeTab?.url}>
                        {activeTab?.title || 'New Tab'}
                    </span>
                    <span className="ap-context-domain">{domainFor(activeTab?.url)}</span>
                </span>
            </div>
            <div className="ap-context-tags">
                <span>{activeWorkspaceName}: {activeWorkspaceTabCount} tabs</span>
                <span>{screenshotEnabled ? 'Page vision on' : 'Text context'}</span>
            </div>
        </div>
    );
}
