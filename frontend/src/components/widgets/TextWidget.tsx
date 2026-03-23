import ReactMarkdown from 'react-markdown';

export function TextWidget({ config }: { config: Record<string, unknown> }) {
  return (
    <div className="prose prose-sm h-full max-w-none overflow-auto">
      <ReactMarkdown>{(config.content as string) || '*No content*'}</ReactMarkdown>
    </div>
  );
}
