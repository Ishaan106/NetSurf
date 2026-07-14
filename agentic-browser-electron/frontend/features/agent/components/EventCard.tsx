import {
    User, Bot, Brain, Wrench, FlaskConical, HelpCircle, AlertTriangle, ChevronDown, Loader2
} from 'lucide-react';
import { AssistantMarkdown } from './AssistantMarkdown';
import { XmlDetails } from './XmlDetails';
import { LabeledPre } from './LabeledPre';
import { PlanCard } from './PlanCard';
import { labelForTool } from '../utils/helpers';

export type PanelEvent =
    | { id: string; kind: 'user'; content: string }
    | { id: string; kind: 'assistant'; content: string; streamId?: string }
    | { id: string; kind: 'thinking'; content: string; streamId: string; completed: boolean }
    | { id: string; kind: 'tool'; toolCallId: string; toolName: string; status: 'streaming' | 'running' | 'completed'; params?: unknown; result?: unknown }
    | { id: string; kind: 'plan'; taskId: string; confirmId: string; workflow: any; status: 'pending' | 'approved' | 'rejected' }
    | { id: string; kind: 'halt'; requestId: string; prompt: string; interactType?: string; options?: string[] }
    | { id: string; kind: 'status'; content: string; tone?: 'ok' | 'muted' }
    | { id: string; kind: 'error'; content: string; detail?: string };

interface EventCardProps {
    event: PanelEvent;
    isExec: boolean;
    approvePlan: () => void;
    rejectPlan: () => void;
}

export function EventCard({
    event,
    isExec,
    approvePlan,
    rejectPlan,
}: EventCardProps) {
    if (event.kind === 'user') {
        return (
            <div className="ap-row user">
                <div className="ap-bubble user">{event.content}</div>
                <div className="ap-avatar user"><User className="w-3.5 h-3.5" /></div>
            </div>
        );
    }

    if (event.kind === 'assistant') {
        return (
            <div className="ap-row">
                <div className="ap-avatar"><Bot className="w-3.5 h-3.5" /></div>
                <div className="ap-bubble assistant">
                    {isExec && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <AssistantMarkdown content={event.content} />
                    <XmlDetails content={event.content} />
                </div>
            </div>
        );
    }

    if (event.kind === 'thinking') {
        return (
            <div className="ap-row">
                <div className="ap-avatar thinking"><Brain className="w-3.5 h-3.5" /></div>
                <details className="ap-card thinking">
                    <summary>
                        <span>{event.completed ? 'Model thinking' : 'Model thinking...'}</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                    </summary>
                    <pre>{event.content}</pre>
                </details>
            </div>
        );
    }

    if (event.kind === 'tool') {
        return (
            <div className="ap-row">
                <div className="ap-avatar tool"><Wrench className="w-3.5 h-3.5" /></div>
                <details className="ap-card tool">
                    <summary>
                        <span>{labelForTool(event.toolName)}</span>
                        <small>{event.status}</small>
                    </summary>
                    {event.params !== undefined && <LabeledPre label="Input" value={event.params} />}
                    {event.result !== undefined && <LabeledPre label="Result" value={event.result} />}
                </details>
            </div>
        );
    }

    if (event.kind === 'plan') {
        return (
            <div className="ap-row">
                <div className="ap-avatar plan"><FlaskConical className="w-3.5 h-3.5" /></div>
                <PlanCard event={event} approvePlan={approvePlan} rejectPlan={rejectPlan} />
            </div>
        );
    }

    if (event.kind === 'halt') {
        return (
            <div className="ap-row">
                <div className="ap-avatar halt"><HelpCircle className="w-3.5 h-3.5" /></div>
                <div className="ap-card halt">
                    <div className="ap-card-title">Input needed</div>
                    <div className="ap-text">{event.prompt}</div>
                    {event.options?.length ? <div className="ap-options">{event.options.map(option => <span key={option}>{option}</span>)}</div> : null}
                </div>
            </div>
        );
    }

    if (event.kind === 'error') {
        return (
            <div className="ap-row">
                <div className="ap-avatar error"><AlertTriangle className="w-3.5 h-3.5" /></div>
                <details className="ap-card error" open={Boolean(event.detail)}>
                    <summary>{event.content}</summary>
                    {event.detail && <pre>{event.detail}</pre>}
                </details>
            </div>
        );
    }

    return <div className={`ap-status ${event.tone || 'muted'}`}>{event.content}</div>;
}
