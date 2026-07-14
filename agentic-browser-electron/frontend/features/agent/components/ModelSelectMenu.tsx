import { Check } from 'lucide-react';

interface ModelSelectMenuProps {
    groups: Array<{ id: string; name: string; enabledModels: string[] }>;
    llmProvider: string;
    llmModel: string;
    onSelect: (provider: string, model: string) => void;
}

export function ModelSelectMenu({
    groups,
    llmProvider,
    llmModel,
    onSelect,
}: ModelSelectMenuProps) {
    if (groups.length === 0) {
        return <div className="ap-menu-empty">No enabled models. Add an API key and enable models in Settings.</div>;
    }

    return (
        <div className="ap-menu-list">
            {groups.map(group => (
                <div key={group.id} className="ap-menu-group">
                    <div className="ap-menu-label">{group.name}</div>
                    {group.enabledModels.map(model => (
                        <button
                            key={model}
                            className={llmProvider === group.id && llmModel === model ? 'selected' : ''}
                            onClick={() => onSelect(group.id, model)}
                        >
                            <span>{model}</span>
                            {llmProvider === group.id && llmModel === model && <Check className="w-3.5 h-3.5" />}
                        </button>
                    ))}
                </div>
            ))}
        </div>
    );
}
