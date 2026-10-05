import type { Options } from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * The react-markdown plugins that typeset LaTeX with KaTeX. Shared by
 * `components/Markdown.tsx` and `scripts/test-math.ts`, so the test renders
 * through exactly the pipeline the UI uses. Bad TeX renders red, never throws.
 */
export const remarkPlugins: Options["remarkPlugins"] = [remarkMath];
export const rehypePlugins: Options["rehypePlugins"] = [[rehypeKatex, { throwOnError: false }]];
