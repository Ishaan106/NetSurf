import React, { useState } from 'react';
import { LayoutGrid, Trash2, Plus, Folder } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useSettingsStore } from '@/store';
import clsx from 'clsx';

export const ICON_PRESETS = ['Briefcase', 'User', 'Search', 'Sparkles', 'Archive', 'Compass', 'Heart', 'LayoutGrid'];

export function WorkspacesTab() {
    const workspaces = useSettingsStore((s) => s.workspaces);
    const addWorkspace = useSettingsStore((s) => s.addWorkspace);
    const deleteWorkspace = useSettingsStore((s) => s.deleteWorkspace);
    const updateWorkspace = useSettingsStore((s) => s.updateWorkspace);

    // New Workspace state
    const [name, setName] = useState('');
    const [color, setColor] = useState('#6c5ce7');
    const [icon, setIcon] = useState('Briefcase');

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        addWorkspace({
            id: `ws-${Date.now()}`,
            name: name.trim(),
            color: `linear-gradient(135deg, ${color} 0%, #12131c 100%)`,
            icon
        });
        setName('');
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold text-chrome-text flex items-center gap-2">
                    <LayoutGrid className="w-5 h-5 text-chrome-accent" />
                    Workspaces Manager
                </h2>
                <p className="text-xs text-chrome-text-secondary">Organize your browsing context by creating isolated workspaces with custom palettes.</p>
            </div>

            {/* List Active Workspaces */}
            <div className="space-y-2">
                <label className="text-xs font-semibold text-chrome-text-muted">Active Workspaces</label>
                <div className="space-y-2.5">
                    {workspaces.map((ws) => (
                        <div key={ws.id} className="flex items-center justify-between p-3.5 bg-chrome-surface border border-chrome-border rounded-xl shadow-sm">
                            <div className="flex items-center gap-3">
                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-white" style={{ background: ws.color }}>
                                    {React.createElement((Icons as any)[ws.icon || 'Folder'] || Folder, { className: "w-3.5 h-3.5" })}
                                </span>
                                <div>
                                    <input 
                                        type="text" 
                                        value={ws.name} 
                                        onChange={(e) => updateWorkspace(ws.id, { name: e.target.value })}
                                        className="text-xs font-bold bg-transparent border-b border-transparent focus:border-chrome-accent outline-none text-chrome-text"
                                    />
                                </div>
                            </div>
                            <button 
                                onClick={() => deleteWorkspace(ws.id)}
                                disabled={workspaces.length <= 1}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-chrome-text-secondary hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Add New Workspace Form */}
            <form onSubmit={handleAdd} className="p-4 bg-chrome-surface border border-chrome-border rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-chrome-text uppercase tracking-wider flex items-center gap-2">
                    <Plus className="w-3.5 h-3.5 text-chrome-accent" />
                    Create New Workspace
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase text-chrome-text-muted">Workspace Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Work, Shopping"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-chrome-bg border border-chrome-border text-xs outline-none focus:border-chrome-accent text-chrome-text"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] uppercase text-chrome-text-muted">Color Palette</label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0 overflow-hidden"
                            />
                            <span className="text-xs font-mono">{color}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-chrome-text-muted">Workspace Icon</label>
                    <div className="flex gap-1.5 overflow-x-auto py-1.5 scrollbar-none">
                        {ICON_PRESETS.map((ic) => (
                            <button
                                key={ic}
                                type="button"
                                onClick={() => setIcon(ic)}
                                className={clsx(
                                    "p-2 rounded-lg border flex items-center justify-center transition-all",
                                    icon === ic 
                                        ? "bg-chrome-accent border-chrome-accent text-chrome-accent" 
                                        : "border-chrome-border hover:bg-chrome-surface-hover text-chrome-text-secondary"
                                )}
                            >
                                {React.createElement((Icons as any)[ic] || Folder, { className: "w-4 h-4" })}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-chrome-accent text-white text-xs font-semibold shadow-sm hover:brightness-105 transition-all"
                >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Workspace</span>
                </button>
            </form>
        </div>
    );
}
