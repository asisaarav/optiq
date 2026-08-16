/**
 * Client-side code beautifiers and language auto-detection. Everything here runs
 * in the browser - no API calls, no cost, and user code never leaves the page.
 *
 * Prettier's language parsers are loaded lazily (dynamic import) so the initial
 * bundle stays small: a user who only formats SQL never downloads the CSS or
 * markdown parser.
 */

import { format as formatSql } from "sql-formatter";
import yaml from "js-yaml";

export type Language =
  | "sql"
  | "json"
  | "javascript"
  | "typescript"
  | "html"
  | "css"
  | "yaml"
  | "xml"
  | "markdown"
  | "python"
  | "unknown";

export interface LanguageMeta {
  id: Language;
  label: string;
  beautifiable: boolean;
}

export const LANGUAGES: LanguageMeta[] = [
  { id: "sql", label: "SQL", beautifiable: true },
  { id: "json", label: "JSON", beautifiable: true },
  { id: "javascript", label: "JavaScript", beautifiable: true },
  { id: "typescript", label: "TypeScript", beautifiable: true },
  { id: "html", label: "HTML", beautifiable: true },
  { id: "css", label: "CSS", beautifiable: true },
  { id: "yaml", label: "YAML", beautifiable: true },
  { id: "xml", label: "XML", beautifiable: true },
  { id: "markdown", label: "Markdown", beautifiable: true },
  { id: "python", label: "Python", beautifiable: false },
  { id: "unknown", label: "Plain text", beautifiable: false },
];

export function languageLabel(id: Language): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? "Plain text";
}

/**
 * Heuristic language detection. Ordered from most to least specific so a JSON
 * document is not mistaken for JavaScript, and SQL is not mistaken for a keyword
 * appearing inside prose. Detection is best-effort and always resolves to a
 * concrete language (falling back to "unknown") so the UI never blocks on it.
 */
export function detectLanguage(raw: string): Language {
  const code = raw.trim();
  if (code === "") return "unknown";

  // Strict JSON: parses cleanly and starts like a JSON value.
  if (/^[[{]/.test(code) || /^"(?:[^"\\]|\\.)*"$/.test(code)) {
    try {
      JSON.parse(code);
      return "json";
    } catch {
      // not valid JSON - keep checking
    }
  }

  // XML / HTML: leading tag. HTML is distinguished by known element names or a
  // doctype; everything else angle-bracketed is treated as XML.
  if (/^\s*<\?xml/i.test(code)) return "xml";
  if (
    /^\s*<!doctype html/i.test(code) ||
    /<(html|head|body|div|span|p|a|ul|li|table|section|nav|header|footer|script|style)\b/i.test(
      code,
    )
  ) {
    return "html";
  }
  if (/^\s*<[a-z][\w-]*(\s|>|\/)/i.test(code)) return "xml";

  // SQL: a leading statement keyword is a strong signal.
  if (
    /^\s*(with|select|insert|update|delete|create|alter|drop|merge|explain|truncate|grant|revoke)\b/i.test(
      code,
    )
  ) {
    return "sql";
  }

  // Python: def/class/import plus colon-terminated blocks, and no semicolons or
  // braces the way JS uses them.
  if (/^\s*(def|class|import|from)\s/m.test(code) && /:\s*$/m.test(code)) {
    return "python";
  }
  if (/\bprint\s*\(/.test(code) && /^\s{4}/m.test(code) && !/[;{]/.test(code)) {
    return "python";
  }

  // TypeScript before JavaScript: type annotations, interfaces, generics.
  if (
    /\b(interface|type)\s+\w+\s*[={<]/.test(code) ||
    /:\s*(string|number|boolean|any|unknown|void|Promise<)/.test(code)
  ) {
    return "typescript";
  }

  // JavaScript: function/const/let/arrow, import/export, template literals.
  if (
    /\b(function|const|let|var|=>|import|export|async|await)\b/.test(code) ||
    /console\.\w+\(/.test(code)
  ) {
    return "javascript";
  }

  // CSS: selector { prop: value; } shape.
  if (
    /[.#]?[\w-]+\s*\{[^}]*:[^}]*\}/.test(code) ||
    /^\s*@(media|import|keyframes|font-face)\b/m.test(code)
  ) {
    return "css";
  }

  // YAML: key: value lines, list dashes, or a document marker. Checked late
  // because it is permissive.
  if (
    /^---\s*$/m.test(code) ||
    (/^[\w-]+\s*:\s*.+$/m.test(code) && !/[{};]/.test(code))
  ) {
    try {
      yaml.load(code);
      return "yaml";
    } catch {
      // not valid YAML
    }
  }

  // Markdown: headings, lists, fenced code, links.
  if (
    /^#{1,6}\s/m.test(code) ||
    /^\s*[-*+]\s/m.test(code) ||
    /```/.test(code) ||
    /\[[^\]]+\]\([^)]+\)/.test(code)
  ) {
    return "markdown";
  }

  return "unknown";
}

const PRETTIER_PARSER: Partial<Record<Language, string>> = {
  javascript: "babel",
  typescript: "typescript",
  html: "html",
  css: "css",
  markdown: "markdown",
};

/** Lazily load only the Prettier plugins a given parser needs. */
async function prettierFor(language: Language, code: string): Promise<string> {
  const prettier = await import("prettier/standalone");
  const parser = PRETTIER_PARSER[language];
  if (!parser) throw new Error(`No Prettier parser for ${language}`);

  const plugins = [];
  if (language === "javascript" || language === "typescript") {
    plugins.push((await import("prettier/plugins/babel")).default);
    plugins.push((await import("prettier/plugins/estree")).default);
  }
  if (language === "typescript") {
    plugins.push((await import("prettier/plugins/typescript")).default);
  }
  if (language === "html") {
    plugins.push((await import("prettier/plugins/html")).default);
  }
  if (language === "css") {
    plugins.push((await import("prettier/plugins/postcss")).default);
  }
  if (language === "markdown") {
    plugins.push((await import("prettier/plugins/markdown")).default);
  }

  return prettier.format(code, {
    parser,
    plugins,
    printWidth: 100,
    tabWidth: 2,
    semi: true,
    singleQuote: false,
  });
}

const SQL_DIALECT: Record<string, string> = {
  postgresql: "postgresql",
  mysql: "mysql",
  oracle: "plsql",
  plsql: "plsql",
  sqlserver: "transactsql",
  snowflake: "snowflake",
  bigquery: "bigquery",
  redshift: "redshift",
  databricks: "spark",
  clickhouse: "sql",
};

export interface BeautifyOptions {
  /** For SQL, the dialect to format against. Defaults to standard SQL. */
  sqlDialect?: string;
}

export interface BeautifyResult {
  ok: boolean;
  output: string;
  error?: string;
}

/**
 * Beautify code for the given language. Never throws: a parse failure returns
 * ok=false with the original text preserved, so the editor content is never lost.
 */
export async function beautify(
  code: string,
  language: Language,
  opts: BeautifyOptions = {},
): Promise<BeautifyResult> {
  if (code.trim() === "") return { ok: true, output: code };

  try {
    switch (language) {
      case "sql": {
        const dialect = SQL_DIALECT[opts.sqlDialect ?? ""] ?? "sql";
        const out = formatSql(code, {
          // sql-formatter's dialect union is wider than our map; the cast is safe
          // because every value above is a valid dialect id.
          language: dialect as Parameters<typeof formatSql>[1] extends {
            language: infer L;
          }
            ? L
            : never,
          keywordCase: "upper",
          tabWidth: 2,
          linesBetweenQueries: 2,
        });
        return { ok: true, output: out };
      }
      case "json": {
        const parsed: unknown = JSON.parse(code);
        return { ok: true, output: JSON.stringify(parsed, null, 2) + "\n" };
      }
      case "yaml": {
        const parsed = yaml.load(code);
        const out = yaml.dump(parsed, {
          indent: 2,
          lineWidth: 100,
          sortKeys: false,
        });
        return { ok: true, output: out };
      }
      case "xml":
        return { ok: true, output: beautifyXml(code) };
      case "javascript":
      case "typescript":
      case "html":
      case "css":
      case "markdown":
        return { ok: true, output: await prettierFor(language, code) };
      default:
        return {
          ok: false,
          output: code,
          error: `No beautifier for ${languageLabel(language)}.`,
        };
    }
  } catch (err) {
    return {
      ok: false,
      output: code,
      error:
        err instanceof Error ? err.message : "Could not format this input.",
    };
  }
}

/**
 * Minimal, dependency-free XML pretty-printer. Prettier's XML support needs an
 * extra plugin; for the common "one-line XML" case this indenter is enough and
 * keeps the bundle lean.
 */
export function beautifyXml(xml: string): string {
  const normalized = xml.replace(/>\s*</g, "><").trim();
  const tokens = normalized.replace(/></g, ">\n<").split("\n");
  let depth = 0;
  const out: string[] = [];
  for (const token of tokens) {
    if (/^<\//.test(token)) depth = Math.max(0, depth - 1);
    out.push("  ".repeat(depth) + token);
    const opensTag = /^<[^!?]/.test(token);
    const selfCloses = /\/>$/.test(token);
    const hasInlineClose = /<\/[\w-]+>$/.test(token);
    if (opensTag && !selfCloses && !hasInlineClose) depth += 1;
  }
  return out.join("\n") + "\n";
}
