import { formatJson } from '../utils/helpers';

export function LabeledPre({ label, value }: { label: string; value: unknown }) {
    return (
        <div className="ap-labeled-pre">
            <div>{label}</div>
            <pre>{formatJson(value)}</pre>
        </div>
    );
}
