import { extractXmlSections } from '../utils/helpers';

export function XmlDetails({ content }: { content: string }) {
    const sections = extractXmlSections(content);
    if (sections.length === 0) return null;
    return (
        <details className="ap-xml">
            <summary>Structured model output</summary>
            {sections.map((section, index) => (
                <div className="ap-xml-section" key={`${section.tag}-${index}`}>
                    <div>{section.tag}</div>
                    <pre>{section.body}</pre>
                </div>
            ))}
        </details>
    );
}
