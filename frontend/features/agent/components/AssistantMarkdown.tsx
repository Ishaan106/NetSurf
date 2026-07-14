import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export function AssistantMarkdown({ content }: { content: string }) {
    if (!content) return null;
    return (
        <ReactMarkdown
            className="ap-md"
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
                a({ href, children, ...props }) {
                    return (
                        <a href={href} target="_blank" rel="noreferrer" {...props}>
                            {children}
                        </a>
                    );
                },
                pre({ children }) {
                    return <>{children}</>;
                },
                code(props: any) {
                    const { inline, className, children, ...rest } = props;
                    if (inline) {
                        return (
                            <code className="ap-inline-code" {...rest}>
                                {children}
                            </code>
                        );
                    }
                    return (
                        <pre className="ap-code-block">
                            <code className={className} {...rest}>
                                {children}
                            </code>
                        </pre>
                    );
                },
            }}
        >
            {content}
        </ReactMarkdown>
    );
}
