import { Check, RotateCcw } from 'lucide-react';
import { extractWorkflowAgents, formatJson } from '../utils/helpers';

interface PlanCardProps {
    event: {
        kind: 'plan';
        taskId: string;
        confirmId: string;
        workflow: any;
        status: 'pending' | 'approved' | 'rejected';
    };
    approvePlan: () => void;
    rejectPlan: () => void;
}

export function PlanCard({
    event,
    approvePlan,
    rejectPlan,
}: PlanCardProps) {
    const agents = extractWorkflowAgents(event.workflow);

    return (
        <div className={`ap-card plan ${event.status}`}>
            <div className="ap-plan-head">
                <div>
                    <div className="ap-card-title">Proposed plan</div>
                    <div className="ap-plan-meta">{agents.length || 1} agent path{agents.length === 1 ? '' : 's'}</div>
                </div>
                <span>{event.status}</span>
            </div>

            <div className="ap-plan-list">
                {agents.length > 0 ? agents.map((agent, index) => (
                    <div className="ap-plan-agent" key={`${agent.name}-${index}`}>
                        <div className="ap-step-index">{index + 1}</div>
                        <div>
                            <div className="ap-plan-agent-title">{agent.name}</div>
                            {agent.task && <div className="ap-plan-task">{agent.task}</div>}
                            {agent.steps.length > 0 && (
                                <ul>
                                    {agent.steps.map((step, stepIndex) => <li key={`${step}-${stepIndex}`}>{step}</li>)}
                                </ul>
                            )}
                        </div>
                    </div>
                )) : (
                    <div className="ap-plan-task">The workflow did not include named steps, but the raw payload is available below.</div>
                )}
            </div>

            <details className="ap-raw">
                <summary>Raw workflow payload</summary>
                <pre>{formatJson(event.workflow)}</pre>
            </details>

            {event.status === 'pending' && (
                <div className="ap-plan-actions">
                    <button className="approve" onClick={approvePlan}>
                        <Check className="w-3.5 h-3.5" />
                        Approve
                    </button>
                    <button onClick={rejectPlan}>
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reject
                    </button>
                </div>
            )}
        </div>
    );
}
