"use client";

import ReactMarkdown, { type Options } from "react-markdown";
import "katex/dist/katex.min.css";
import { normalizeMathDelimiters } from "@/lib/math-delimiters";
import { remarkPlugins, rehypePlugins } from "@/lib/markdown-math";

type Props = Omit<Options, "children" | "remarkPlugins" | "rehypePlugins"> & {
  children: string;
};

/** react-markdown with LaTeX math (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`) typeset by KaTeX. */
export default function Markdown({ children, ...props }: Props) {
  return (
    <ReactMarkdown
      {...props}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
    >
      {normalizeMathDelimiters(children)}
    </ReactMarkdown>
  );
}
