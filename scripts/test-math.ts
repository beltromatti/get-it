/**
 * Behavior tests for LaTeX math rendering.
 *
 *  - lib/math-delimiters.ts: `\(…\)` / `\[…\]` normalization
 *  - the chat / 2D-text render path (react-markdown + remark-math + KaTeX)
 *  - lib/md-to-pdf.ts: math in imported Markdown is typeset, and its TeX
 *    source is still extractable as text for the agents
 *
 * Run: npx tsx scripts/test-math.ts
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { normalizeMathDelimiters as n } from "../lib/math-delimiters";
import { remarkPlugins, rehypePlugins } from "../lib/markdown-math";
import { markdownToPdf } from "../lib/md-to-pdf";
import { createMathRenderer } from "../lib/md-math";
import { extractPdf } from "../lib/pdf-extract";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`);
}
function eq(name: string, actual: string, expected: string) {
  check(name, actual === expected, `got ${JSON.stringify(actual)}`);
}

// ── Delimiter normalization ─────────────────────────────────────────────
eq("inline \\( \\) becomes $ $", n("so \\(x^2\\) grows"), "so $x^2$ grows");
eq("display \\[ \\] on its own line becomes a $$ block", n("\\[\\frac{a}{b}\\]"), "$$\n\\frac{a}{b}\n$$");
eq("mid-line \\[ \\] becomes $$ $$", n("so \\[x\\] here"), "so $$x$$ here");
eq("one-line $$ $$ on its own line becomes a block", n("a\n$$x$$\nb"), "a\n$$\nx\n$$\nb");
eq("display block keeps list indentation", n("- item\n  \\[x\\]"), "- item\n  $$\n  x\n  $$");
eq("display next to inline code stays inline", n("`c` \\[x\\]"), "`c` $$x$$");
eq("currency is escaped, not math", n("$20,000 and $30,000"), "\\$20,000 and \\$30,000");
eq("a lone $ is escaped", n("costs $5 total"), "costs \\$5 total");
eq("math next to currency", n("$x$ costs $5"), "$x$ costs \\$5");
eq("multiline display", n("\\[\na + b\n\\]"), "$$\na + b\n$$");
eq("dollar math is untouched", n("$a$ and $$b$$"), "$a$ and $$b$$");
eq("plain text is untouched", n("no math here (really)"), "no math here (really)");
eq("escaped backslash is not a delimiter", n("a \\\\(b) c"), "a \\\\(b) c");
eq("inline code is untouched", n("`\\(x\\)` vs \\(y\\)"), "`\\(x\\)` vs $y$");
eq("double-backtick code is untouched", n("``a ` \\(x\\)`` vs \\(y\\)"), "``a ` \\(x\\)`` vs $y$");
eq("fenced code is untouched", n("```tex\n\\[x\\]\n```\n\\[y\\]"), "```tex\n\\[x\\]\n```\n$$\ny\n$$");
eq("indented code is untouched", n("text\n\n    \\(x\\)\n\n\\(y\\)"), "text\n\n    \\(x\\)\n\n$y$");
eq("indented list continuation is prose", n("- item\n\n    see \\(x\\)"), "- item\n\n    see $x$");
eq("indented code after a paragraph is code", n("para\n\n    \\(x\\)"), "para\n\n    \\(x\\)");
eq("CRLF display math on its own line", n("a\r\n\\[x\\]\r\nb"), "a\r\n$$\nx\n$$\r\nb");
eq("code nested in a list item is code", n("- item\n\n      \\(x\\)"), "- item\n\n      \\(x\\)");
eq("a nested item indented 4+ keeps its own indent", n("- parent\n    - child\n\n      see \\(x\\)"), "- parent\n    - child\n\n      see $x$");
eq("code in a deeply nested item is code", n("- parent\n    - child\n\n          \\(x\\)"), "- parent\n    - child\n\n          \\(x\\)");
eq("code back in the parent item is code", n("- parent\n    - child\n\n  parent text\n\n      \\(x\\)"), "- parent\n    - child\n\n  parent text\n\n      \\(x\\)");
eq("prose back in the parent item is prose", n("- parent\n    - child\n\n  see \\(x\\)"), "- parent\n    - child\n\n  see $x$");
eq("a sibling item resets the indent", n("- a\n    - child\n- b\n\n      \\(x\\)"), "- a\n    - child\n- b\n\n      \\(x\\)");
eq("a top-level fence ends the list", n("- item\n\n```\nc\n```\n\n    \\(x\\)"), "- item\n\n```\nc\n```\n\n    \\(x\\)");
eq("unclosed fence keeps the rest as code", n("````\n\\(x\\)\n```\n\\(y\\)"), "````\n\\(x\\)\n```\n\\(y\\)");

// Many openers with no closer must stay linear (was quadratic as a regex).
// The old regex took minutes on this; a linear pass takes milliseconds, so
// the generous cap catches a quadratic regression without flaking on slow CI.
const hostile = "\\( \\[ ` $$ ".repeat(200_000);
const t0 = performance.now();
const out = n(hostile);
const ms = performance.now() - t0;
check("unmatched openers stay fast", out.length >= hostile.length && ms < 3000, `${ms.toFixed(0)} ms`);

// ── Chat / 2D text render path ──────────────────────────────────────────
const html = (md: string) =>
  renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins, rehypePlugins }, n(md)));

check("$…$ renders KaTeX", html("so $x^2$ grows").includes('class="katex"'));
check("\\(…\\) renders KaTeX", html("so \\(x^2\\) grows").includes('class="katex"'));
check("\\[…\\] renders display KaTeX", html("\\[\\frac{a}{b}\\]").includes("katex-display"));
check("bad TeX renders an error, not a throw", html("$\\frac{a$").includes("katex-error"));
check("one-line $$ $$ renders as display", html("$$\\frac{a}{b}$$").includes("katex-display"));
check("currency stays text", !html("$20,000 and $30,000").includes("katex") && html("$20,000 and $30,000").includes("$20,000 and $30,000"));
check("code stays code", !html("`\\(x\\)`").includes("katex") && html("`\\(x\\)`").includes("<code>\\(x\\)</code>"));

// ── MathJax macro state ─────────────────────────────────────────────────
{
  const r = createMathRenderer();
  const w = (tex: string) => r(tex, false, 10, "#000").width;
  const undefinedFoo = w("\\foo");
  w("\\newcommand{\\foo}{xxxxxxxx}");
  const defined = w("\\foo");
  w("\\renewcommand{\\foo}{x}");
  const redefined = w("\\foo");
  check("macros: a cached formula is re-typeset after \\newcommand", defined !== undefinedFoo, `${undefinedFoo} → ${defined}`);
  check("macros: … and after \\renewcommand", redefined !== defined, `${defined} → ${redefined}`);
  const other = createMathRenderer();
  check("macros: one document's macros don't leak into another", other("\\foo", false, 10, "#000").width === undefinedFoo);
}

// ── Markdown → PDF import ───────────────────────────────────────────────
async function pdfChecks() {
  const md = [
    "# Limits",
    "",
    "Siano $a_n=\\dfrac{(-1)^n}{n}$ e $b_n\\to0$. Allora",
    "$$",
    "\\lim_{n\\to\\infty}\\frac{a_n}{b_n}",
    "$$",
    "Posto \\(c_n\\): **bold** and a [link](https://example.com), price $5 and `$code$`.",
    "",
    "- item with $\\sqrt{x^2+1}$",
    "- broken $\\frac{a$",
    "",
    "Plain symbols x → ∞, ε > 0. ∎",
    "",
    "| $\\lim a_n$ | note |",
    "|---|---|",
    "| $\\pm\\infty$ | regola dei segni |",
  ].join("\n");
  const pdf = await markdownToPdf(md);
  const text = (await extractPdf(new Uint8Array(pdf))).pages
    .flatMap((p) => p.items.map((i) => i.str))
    .join(" ");
  check("PDF: inline TeX source is extractable", text.includes("a_n=\\dfrac{(-1)^n}{n}"), text.slice(0, 200));
  check("PDF: display TeX source is extractable", text.includes("\\lim_{n\\to\\infty}\\frac{a_n}{b_n}"));
  check("PDF: \\(…\\) math is typeset too", text.includes("c_n") && !text.includes("\\(c_n"));
  check("PDF: no raw $$ delimiters left", !text.includes("$$"));
  check("PDF: prose around math survives", ["Siano", "Allora", "Posto", "bold", "link", "item with"].every((w) => text.includes(w)));
  check("PDF: plain-text math symbols are typeset", ["\\to", "\\infty", "\\varepsilon", "\\blacksquare"].every((t) => text.includes(t)));
  check("PDF: table cells are typeset", text.includes("\\lim a_n") && text.includes("\\pm\\infty") && text.includes("regola dei segni"));
  check("PDF: price and code spans are not math", text.includes("$5") && text.includes("$code$"));
}

async function layoutChecks() {
  const md = [
    "x \\(a +",
    "b\\) y",
    "",
    "- item",
    "",
    "  $$",
    "  \\frac{1}{2}",
    "  $$",
    "",
    "| a | b |",
    "|---|---|",
    `| https://example.com/${"a".repeat(150)} | right |`,
  ].join("\n");
  const pdf = await markdownToPdf(md);
  const items = (await extractPdf(new Uint8Array(pdf))).pages.flatMap((p) => p.items);
  const text = items.map((i) => i.str).join(" ");
  // A typeset formula's TeX is the invisible text squeezed over the SVG,
  // far smaller than body text; raw TeX printed as prose is full size.
  const typeset = (tex: string) => items.some((i) => i.str.includes(tex) && i.height < 8);
  // (Unconverted, it would print as literal "$a + b$".)
  check("PDF: inline math across lines is typeset", text.includes("a + b") && !text.includes("$"), text.slice(0, 120));
  check("PDF: display math inside a list item is typeset", typeset("\\frac{1}{2}"));
  const col2 = 64 + (595.28 - 128) / 2;
  const spill = items.filter((i) => i.x < col2 - 1 && i.x + i.width > col2 + 1);
  check("PDF: a long word stays inside its table cell", spill.length === 0, spill.map((i) => i.str.slice(0, 30)).join(", "));
}

async function tallRowChecks() {
  const left = Array.from({ length: 600 }, (_, i) => `L${i} $x_{${i}}$`).join(" ");
  const right = Array.from({ length: 600 }, (_, i) => `R${i} words`).join(" ");
  const pdf = await markdownToPdf(`| a | b |\n|---|---|\n| ${left} | ${right} |\n`);
  const pages = (await extractPdf(new Uint8Array(pdf))).pages;
  check("PDF: a row taller than a page spans pages", pages.length > 1, `${pages.length} page(s)`);
  // On every continuation page, both columns must resume at the same height.
  const drift = pages.slice(1).map((p) => {
    const yl = p.items.find((it) => /\bL\d+/.test(it.str))?.y;
    const yr = p.items.find((it) => /\bR\d+/.test(it.str))?.y;
    return yl === undefined || yr === undefined ? Infinity : Math.abs(yl - yr);
  });
  check("PDF: cells of a split row stay aligned on every page", drift.every((d) => d < 6), drift.join(", "));
  const all = pages.flatMap((p) => p.items.map((i) => i.str)).join(" ");
  check("PDF: a split row keeps its last lines", all.includes("L599") && /R599\b/.test(all));
}

pdfChecks()
  .then(layoutChecks)
  .then(tallRowChecks)
  .catch((err) => check("PDF: renders without throwing", false, String(err)))
  .finally(() => {
    if (failures) {
      console.log(`\n${failures} failure(s)`);
      process.exit(1);
    }
    console.log("\nall passed");
  });
