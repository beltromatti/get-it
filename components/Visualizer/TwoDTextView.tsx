"use client";

import Markdown from "@/components/Markdown";
import { ExternalLink } from "lucide-react";
import type { TwoDTextSpec } from "@/lib/schemas";

type Props = { spec: TwoDTextSpec };

export default function TwoDTextView({ spec }: Props) {
  return (
    <div className="h-full w-full overflow-auto bg-[var(--surface-raised)] px-7 py-6 text-[var(--ink-700)]">
      <article className="prose prose-sm max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-[var(--ink-900)] prose-p:leading-relaxed prose-p:text-[var(--ink-700)] prose-strong:text-[var(--ink-900)] prose-a:text-[var(--accent-600)] prose-a:no-underline hover:prose-a:underline prose-li:text-[var(--ink-700)] prose-code:rounded prose-code:bg-[var(--surface-sunken)] prose-code:px-1 prose-code:py-0.5 prose-code:text-[var(--ink-900)] prose-code:before:content-none prose-code:after:content-none">
        <Markdown>{spec.body_markdown}</Markdown>
      </article>
      {spec.citations.length > 0 && (
        <div className="mt-8 border-t border-[var(--border-subtle)] pt-5">
          <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-400)]">
            Sources
          </p>
          <ul className="space-y-3 text-[13px]">
            {spec.citations.map((c, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--surface-sunken)] text-[10px] font-medium text-[var(--ink-700)]">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[var(--ink-900)]">{c.label}</p>
                  <p className="text-[var(--ink-500)]">{c.source}</p>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-[var(--accent-600)] hover:text-[var(--accent-700)]"
                    >
                      {new URL(c.url).hostname}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
