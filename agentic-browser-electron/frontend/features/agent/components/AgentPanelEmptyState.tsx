import { Eye, Sparkles, ChevronDown } from 'lucide-react';
import { Favicon } from './Favicon';
import { domainFor } from '../utils/helpers';

interface AgentPanelEmptyStateProps {
    activeTab?: {
        title?: string;
        url?: string;
        favicon?: string;
    };
    suggestions: Array<{ label: string; text: string }>;
    handleSuggestionClick: (text: string) => void;
}

export function AgentPanelEmptyState({
    activeTab,
    suggestions,
    handleSuggestionClick
}: AgentPanelEmptyStateProps) {
    return (
        <div className="ap-empty">
            {/* Page Preview Thumbnail Card */}
            {activeTab && activeTab.url !== 'about:blank' && (
                <div className="ap-peek-card">
                    <div className="ap-peek-label">
                        <Eye className="w-3.5 h-3.5" />
                        <span>I can see this page</span>
                    </div>
                    <div className="ap-peek-row">
                        <div className="ap-peek-favicon">
                            <Favicon url={activeTab.url || ''} favicon={activeTab.favicon} />
                        </div>
                        <div className="ap-peek-meta">
                            <div className="ap-peek-title">{activeTab.title || domainFor(activeTab.url)}</div>
                            <div className="ap-peek-domain">{domainFor(activeTab.url)}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Proactive suggestion card */}
            <div className="ap-proactive">
                <div className="ap-proactive-title">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Proactive Suggestion</span>
                </div>
                <p>
                    Would you like me to synthesize the core topics and action items from this document?
                </p>
                <button
                    onClick={() => handleSuggestionClick('Summarize the active page and list the key takeaways.')}
                    className="ap-proactive-cta"
                >
                    Yes, summarize
                </button>
            </div>

            {/* Checklist of options */}
            <div className="ap-quicktasks">
                <div className="ap-quicktasks-label">Quick tasks</div>
                <div className="ap-quicktasks-grid">
                    {suggestions.map((sug) => (
                        <button
                            key={sug.label}
                            onClick={() => handleSuggestionClick(sug.text)}
                            className="ap-quicktask-card"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="ap-quicktask-title">{sug.label}</div>
                                <div className="ap-quicktask-meta">{sug.text}</div>
                            </div>
                            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 ml-2 rotate-270" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
export default AgentPanelEmptyState;
