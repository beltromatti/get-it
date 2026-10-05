/**
 * remark-math only understands `$…$` and `$$…$$`, but models routinely answer
 * with LaTeX-style `\(…\)` and `\[…\]`. Rewrite those to dollar delimiters so
 * they render, leaving Markdown code (fenced and indented blocks, inline
 * spans of any backtick length) untouched.
 *
 * Runs on every chat render, so it is a single linear pass: no regex
 * backtracking, and an opener with no closer is searched for at most once.
 */

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
// Indent is checked separately: a nested item's marker can sit 4+ columns in.
const LIST_ITEM = /^[ \t]*([-*+]|\d{1,9}[.)])[ \t]/;

/** Leading indentation in columns (tab = 4). */
function indentOf(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 4 - (n % 4);
    else break;
  }
  return n;
}

export function normalizeMathDelimiters(md: string): string {
  let out = "";
  let prose: string[] = [];
  const flushProse = () => {
    if (prose.length) out += convertProse(prose.join(""));
    prose = [];
  };

  let fence: string | null = null; // the open fence run, e.g. "```"
  let prevBlank = true;
  let inIndented = false;
  // Content indents of the open list items, innermost last. Inside an item,
  // indented lines are its continuation paragraphs; only 4+ columns past its
  // content indent is code (CommonMark).
  const lists: number[] = [];
  for (const line of md.split(/(?<=\n)/)) {
    const blank = line.trim() === "";
    if (fence) {
      out += line;
      const close = FENCE.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length && line.trim() === close[1]) fence = null;
      continue;
    }
    const open = FENCE.exec(line);
    const indent = indentOf(line);
    const marker = LIST_ITEM.exec(line);
    // A line left of an item's content closes that item when it starts a new
    // block: after a blank line, a fence, a sibling or outer marker, or any
    // unindented line. (Erring toward closing only ever errs toward "code",
    // which is never rewritten.)
    if (!blank && (prevBlank || open || marker || indent === 0)) {
      while (lists.length && indent < lists[lists.length - 1]) lists.pop();
    }
    const codeIndent = (lists[lists.length - 1] ?? 0) + 4;
    if (open) {
      flushProse();
      fence = open[1];
      out += line;
      inIndented = false;
    } else if (!blank && (prevBlank || inIndented) && indent >= codeIndent) {
      flushProse();
      out += line;
      inIndented = true;
    } else if (blank && inIndented) {
      out += line;
    } else {
      inIndented = false;
      // A marker opens a (nested) item unless it's indented far enough to be
      // code; the item's content starts after the marker and its space.
      if (marker && indent < codeIndent) lists.push(indentOf(marker[0].replace(/[^ \t]/g, " ")));
      prose.push(line);
    }
    prevBlank = blank;
  }
  flushProse();
  return out;
}

/** Convert delimiters in prose, passing inline code spans (`` `x` ``, ``` ``x`` ```) through. */
function convertProse(text: string): string {
  let out = "";
  let i = 0;
  let from = 0;
  // Backtick-run lengths known to have no closer from here on.
  const unclosed = new Set<number>();
  while (i < text.length) {
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let j = i;
    while (text[j] === "`") j++;
    const run = j - i;
    const close = unclosed.has(run) ? -1 : findRun(text, j, run);
    if (close < 0) {
      unclosed.add(run);
      i = j;
      continue;
    }
    out += convertMath(text.slice(from, i), from === 0, false) + text.slice(i, close + run);
    i = from = close + run;
  }
  return out + convertMath(text.slice(from), from === 0, true);
}

/** Index of the next backtick run of exactly `run` length at or after `start`, or -1. */
function findRun(text: string, start: number, run: number): number {
  let i = start;
  while ((i = text.indexOf("`", i)) >= 0) {
    let j = i;
    while (text[j] === "`") j++;
    if (j - i === run) return i;
    i = j;
  }
  return -1;
}

const isBlank = (c: string | undefined) => c === " " || c === "\t";

/**
 * Rewrite math in one stretch of prose (no code inside). `startsLine` /
 * `endsLine` say whether the stretch's edges are real line edges or the
 * sides of an inline code span.
 *
 *  - `\(x\)` → `$x$`
 *  - `\[x\]` and `$$x$$` alone on a line → a `$$` fence block, which
 *    remark-math renders as display math (a one-line `$$x$$` is inline)
 *  - a `$` that can't be math by Pandoc's rule (opener followed by a space,
 *    closer preceded by a space or followed by a digit) → `\$`, so prose
 *    like "$20 and $30" stays text instead of turning into a formula
 */
function convertMath(s: string, startsLine: boolean, endsLine: boolean): string {
  let out = "";
  let from = 0; // start of the not-yet-copied input
  let j = 0;
  const unclosed = new Set<string>();
  const replace = (end: number, text: string, resume: number) => {
    out += s.slice(from, end) + text;
    from = j = resume;
  };
  /** The indent before `start` if [start, end) is alone on its line, else null. */
  const lineIndent = (start: number, end: number): string | null => {
    let a = start - 1;
    while (a >= 0 && isBlank(s[a])) a--;
    let b = end;
    while (b < s.length && isBlank(s[b])) b++;
    const lineEnd = s[b] === "\n" || (s[b] === "\r" && s[b + 1] === "\n");
    const ownLine = (a < 0 ? startsLine : s[a] === "\n") && (b >= s.length ? endsLine : lineEnd);
    return ownLine ? s.slice(a + 1, start) : null;
  };
  const fence = (tex: string, indent: string) => `$$\n${indent}${tex.trim()}\n${indent}$$`;
  const search = (needle: string, at: number) => {
    if (unclosed.has(needle)) return -1;
    const k = s.indexOf(needle, at);
    if (k < 0) unclosed.add(needle);
    return k;
  };

  while (j < s.length) {
    const c = s[j];
    if (c === "\\") {
      const next = s[j + 1];
      const closer = next === "(" ? "\\)" : next === "[" ? "\\]" : null;
      const close = closer ? search(closer, j + 2) : -1;
      if (close <= j + 2) {
        j += 2; // any other escape (`\\`, `\$`, …) or an empty / unclosed pair
        continue;
      }
      const tex = s.slice(j + 2, close);
      const indent = next === "[" ? lineIndent(j, close + 2) : null;
      replace(j, indent !== null ? fence(tex, indent) : next === "[" ? `$$${tex}$$` : `$${tex}$`, close + 2);
    } else if (c === "$" && s[j + 1] === "$") {
      const close = search("$$", j + 2);
      if (close < 0) {
        j += 2;
        continue;
      }
      const tex = s.slice(j + 2, close);
      const indent = tex.includes("\n") ? null : lineIndent(j, close + 2);
      if (indent !== null) replace(j, fence(tex, indent), close + 2);
      else j = close + 2;
    } else if (c === "$") {
      // The next `$` is this one's only possible closer; if they don't pair,
      // the scan resumes right after this `$`, so each stretch is read once.
      const k = s.indexOf("$", j + 1);
      const pairs = k > j + 1 && !/\s/.test(s[j + 1]) && !/\s/.test(s[k - 1]) && !/\d/.test(s[k + 1] ?? "");
      if (pairs) j = k + 1;
      else replace(j, "\\$", j + 1);
    } else {
      j++;
    }
  }
  return out + s.slice(from);
}
