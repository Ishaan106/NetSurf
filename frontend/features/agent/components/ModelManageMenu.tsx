import { ToggleLeft, ToggleRight } from 'lucide-react';

interface ModelManageMenuProps {
    groups: Array<{ id: string; name: string; models: string[] }>;
    enabledModels: Record<string, string[]>;
    onSetEnabled: (provider: string, models: string[]) => void;
}

export function ModelManageMenu({
    groups,
    enabledModels,
    onSetEnabled,
}: ModelManageMenuProps) {
    if (groups.length === 0) {
        return <div className="ap-menu-empty">No discovered models yet. Use Settings to test a provider key first.</div>;
    }

    return (
        <div className="ap-menu-list">
            {groups.map(group => {
                const enabled = enabledModels[group.id] || [];
                const allEnabled = group.models.every(model => enabled.includes(model));
                return (
                    <div key={group.id} className="ap-menu-group">
                        <div className="ap-menu-label with-action">
                            <span>{group.name}</span>
                            <button onClick={() => onSetEnabled(group.id, allEnabled ? [] : group.models)}>
                                {allEnabled ? 'Disable' : 'Enable'} all
                            </button>
                        </div>
                        {group.models.map(model => {
                            const isOn = enabled.includes(model);
                            return (
                                <button
                                    key={model}
                                    className={isOn ? 'enabled' : ''}
                                    onClick={() => onSetEnabled(group.id, isOn ? enabled.filter(item => item !== model) : [...enabled, model])}
                                >
                                    <span>{model}</span>
                                    {isOn ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                </button>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
