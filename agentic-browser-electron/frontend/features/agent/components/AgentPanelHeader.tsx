import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronDown, Settings, X } from 'lucide-react';
import { ModelSelectMenu } from './ModelSelectMenu';
import { ModelManageMenu } from './ModelManageMenu';

interface AgentPanelHeaderProps {
    currentProviderName: string;
    modelLabel: string;
    showPicker: boolean;
    setShowPicker: (show: boolean) => void;
    pickerMode: 'select' | 'manage';
    setPickerMode: (mode: 'select' | 'manage') => void;
    selectableGroups: any[];
    providerGroups: any[];
    enabledModels: Record<string, string[]>;
    llmProvider: string;
    llmModel: string;
    setLLMProvider: (provider: any) => void;
    setLLMModel: (model: string) => void;
    setModelEnabled: (providerId: string, models: string[]) => void;
    closePanel: () => void;
}

export function AgentPanelHeader({
    currentProviderName,
    modelLabel,
    showPicker,
    setShowPicker,
    pickerMode,
    setPickerMode,
    selectableGroups,
    providerGroups,
    enabledModels,
    llmProvider,
    llmModel,
    setLLMProvider,
    setLLMModel,
    setModelEnabled,
    closePanel
}: AgentPanelHeaderProps) {
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setShowPicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [setShowPicker]);

    return (
        <div className="ap-header">
            <div className="ap-brand">
                <Sparkles className="w-4 h-4" />
                <div>
                    <div className="ap-title">Netsurf AI</div>
                    <div className="ap-subtitle">{currentProviderName}</div>
                </div>
            </div>

            <div className="ap-picker" ref={pickerRef}>
                <button className="ap-picker-btn" onClick={() => setShowPicker(!showPicker)}>
                    <span>{modelLabel}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <AnimatePresence>
                    {showPicker && (
                        <motion.div
                            className="ap-menu"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                        >
                            <div className="ap-menu-top">
                                <span>{pickerMode === 'select' ? 'Enabled models' : 'Manage enabled'}</span>
                                <button onClick={() => setPickerMode(pickerMode === 'select' ? 'manage' : 'select')}>
                                    <Settings className="w-3 h-3" />
                                    {pickerMode === 'select' ? 'Manage' : 'Done'}
                                </button>
                            </div>

                            {pickerMode === 'select' ? (
                                <ModelSelectMenu
                                    groups={selectableGroups}
                                    llmProvider={llmProvider}
                                    llmModel={llmModel}
                                    onSelect={(providerId, model) => {
                                        setLLMProvider(providerId as any);
                                        setLLMModel(model);
                                        setShowPicker(false);
                                    }}
                                />
                            ) : (
                                <ModelManageMenu
                                    groups={providerGroups}
                                    enabledModels={enabledModels}
                                    onSetEnabled={setModelEnabled}
                                />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <button className="ap-icon-btn" onClick={closePanel} aria-label="Close agent panel">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
