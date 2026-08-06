"use client";

/**
 * Top-bar Settings button + popover.
 *
 * Three runtime knobs:
 *   1. AI Provider selector (Codex CLI, Gemini CLI, Claude Code)
 *   2. Auto-generate toggle
 *   3. Viz repair budget (max retries)
 *
 * Persisted to `/api/settings`. Stateless from the parent's POV — every
 * popover open does a fresh fetch, every change POSTs back, and a
 * `getit:settings` CustomEvent is dispatched so other components on the
 * page can react mid-session without polling.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings2, Pencil, Check, Sun, Moon, Monitor } from "lucide-react";
import { AUTO_GENERATE_VIZ, MAX_VIZ_GEN_RETRIES } from "@/lib/config";
import { APP_VERSION } from "@/lib/version";
import type { ProviderName } from "@/lib/provider-types";

export type SettingsPayload = {
  autoGenerate: boolean;
  maxRetries: number;
  provider: ProviderName;
  codexModelFast?: string;
  codexModelSmart?: string;
  codexEffortFast?: string;
  codexEffortSmart?: string;
  geminiApiKey?: string;
  geminiModelFast?: string;
  geminiModelSmart?: string;
  claudeModelFast?: string;
  claudeModelSmart?: string;
  claudeEffortFast?: string;
  claudeEffortSmart?: string;
  piUrl?: string;
  piApiKey?: string;
  piModelFast?: string;
  piModelSmart?: string;
  piProvider?: "ollama" | "gemini" | "openai" | "anthropic" | "custom";
  piApiType?: "openai-completions" | "google-generative-ai" | "anthropic-messages";
  theme?: "light" | "dark" | "system";
};

export const SETTINGS_EVENT = "getit:settings";

const ENGINE_LABEL: Record<ProviderName, string> = {
  codex: "OpenAI — Codex CLI",
  gemini: "Google — Gemini (API key)",
  claude: "Anthropic — Claude Code",
  pi: "Bring your own key (BYOK)",
};

function EditableModelSelect({ 
  label, 
  value, 
  onChange, 
  options 
}: { 
  label: string; 
  value: string; 
  onChange: (v: string) => void; 
  options: { value: string; label: string }[] 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const isCustom = !options.some(o => o.value === value);
  const showEdit = isEditing || isCustom;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-[11.5px] font-medium text-[var(--ink-900)]">
          {label}
        </label>
        <button 
          type="button" 
          onClick={() => {
            if (isCustom) {
              onChange(options[0]?.value || "");
              setIsEditing(false);
            } else {
              setIsEditing(!showEdit);
            }
          }}
          className="text-[var(--ink-500)] hover:text-[var(--ink-900)]"
          title={showEdit ? "Select from list" : "Enter custom model"}
        >
          {showEdit ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
        </button>
      </div>
      {showEdit ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 text-[12px] font-medium text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
          placeholder="Custom model..."
        />
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 text-[12px] font-medium text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export default function SettingsButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <span className="viz-tooltip-anchor relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="tab-icon-btn"
          aria-label="Settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
        {!open && (
          <span className="viz-tooltip" role="tooltip">
            Settings — provider, visualization preferences.
          </span>
        )}
      </span>
      <AnimatePresence>
        {open && (
          <motion.div
            key="settings-menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-30 mt-1.5 w-[22rem] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-popover)]"
          >
            <SettingsPanel refreshKey={open ? "open" : "closed"} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsPanel({ refreshKey }: { refreshKey: string }) {
  const [provider, setProvider] = useState<ProviderName>("codex");
  const [autoGenerate, setAutoGenerate] = useState<boolean>(AUTO_GENERATE_VIZ);
  const [maxRetries, setMaxRetries] = useState<number>(MAX_VIZ_GEN_RETRIES);

  // Managed specific
  const [codexModelFast, setCodexModelFast] = useState<string>("gpt-5.6-luna");
  const [codexModelSmart, setCodexModelSmart] = useState<string>("gpt-5.6-sol");
  const [codexEffortFast, setCodexEffortFast] = useState<string>("high");
  const [codexEffortSmart, setCodexEffortSmart] = useState<string>("medium");
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [geminiModelFast, setGeminiModelFast] = useState<string>("gemini-flash-latest");
  const [geminiModelSmart, setGeminiModelSmart] = useState<string>("gemini-pro-latest");
  const [claudeModelFast, setClaudeModelFast] = useState<string>("sonnet");
  const [claudeModelSmart, setClaudeModelSmart] = useState<string>("opus");
  const [claudeEffortFast, setClaudeEffortFast] = useState<string>("medium");
  const [claudeEffortSmart, setClaudeEffortSmart] = useState<string>("high");

  // PI specific
  const [piUrl, setPiUrl] = useState<string>("http://localhost:11434/v1");
  const [piApiKey, setPiApiKey] = useState<string>("");
  const [piModelFast, setPiModelFast] = useState<string>("llama3.2");
  const [piModelSmart, setPiModelSmart] = useState<string>("llama3.2");
  const [piProvider, setPiProvider] = useState<"ollama" | "gemini" | "openai" | "anthropic" | "custom">("ollama");
  const [piApiType, setPiApiType] = useState<"openai-completions" | "google-generative-ai" | "anthropic-messages">("openai-completions");

  const [theme, setTheme] = useState<"light" | "dark" | "system" | undefined>();
  const hydratedRef = useRef(false);
  const userToggledRef = useRef(false);
  const [osPrefersDark, setOsPrefersDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setOsPrefersDark(mq.matches);
    const onChange = () => setOsPrefersDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // The chosen appearance mode — defaults to light when nothing is stored.
  const selectedTheme = theme ?? "light";

  // Fetch fresh on every popover open
  useEffect(() => {
    if (refreshKey !== "open") return;
    hydratedRef.current = false;
    userToggledRef.current = false;
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Partial<SettingsPayload>) => {
        if (cancelled) return;
        if (typeof s.autoGenerate === "boolean") setAutoGenerate(s.autoGenerate);
        if (typeof s.maxRetries === "number") setMaxRetries(s.maxRetries);
        if (s.provider) setProvider(s.provider);
        if (typeof s.codexModelFast === "string") setCodexModelFast(s.codexModelFast);
        if (typeof s.codexModelSmart === "string") setCodexModelSmart(s.codexModelSmart);
        if (typeof s.codexEffortFast === "string") setCodexEffortFast(s.codexEffortFast);
        if (typeof s.codexEffortSmart === "string") setCodexEffortSmart(s.codexEffortSmart);
        if (typeof s.geminiApiKey === "string") setGeminiApiKey(s.geminiApiKey);
        if (typeof s.geminiModelFast === "string") setGeminiModelFast(s.geminiModelFast);
        if (typeof s.geminiModelSmart === "string") setGeminiModelSmart(s.geminiModelSmart);
        if (typeof s.claudeModelFast === "string") setClaudeModelFast(s.claudeModelFast);
        if (typeof s.claudeModelSmart === "string") setClaudeModelSmart(s.claudeModelSmart);
        if (typeof s.claudeEffortFast === "string") setClaudeEffortFast(s.claudeEffortFast);
        if (typeof s.claudeEffortSmart === "string") setClaudeEffortSmart(s.claudeEffortSmart);
        if (typeof s.piUrl === "string") setPiUrl(s.piUrl);
        if (typeof s.piApiKey === "string") setPiApiKey(s.piApiKey);
        if (typeof s.piModelFast === "string") setPiModelFast(s.piModelFast);
        if (typeof s.piModelSmart === "string") setPiModelSmart(s.piModelSmart);
        if (typeof s.piProvider === "string") setPiProvider(s.piProvider);
        if (typeof s.piApiType === "string") setPiApiType(s.piApiType);
        if (!userToggledRef.current && (s.theme === "light" || s.theme === "dark" || s.theme === "system")) setTheme(s.theme);

        if (!cancelled) {
          setTimeout(() => {
            if (!cancelled) hydratedRef.current = true;
          }, 10);
        }
      })
      .catch(() => {
        hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const persist = useCallback((delta: Partial<SettingsPayload>, skipHydrationCheck = false) => {
    // Block non-theme writes until the fetch populates server-saved values.
    // Without this, a user who toggles autoGenerate or maxRetries before the
    // fetch resolves would persist a value derived from the build-time
    // default (AUTO_GENERATE_VIZ / MAX_VIZ_GEN_RETRIES), silently overwriting
    // whatever was previously saved on disk.
    // The theme toggle is exempted so it can work immediately on open.
    if (!skipHydrationCheck && !hydratedRef.current) return;
    void fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(delta),
      keepalive: true,
    })
      .then((r) => r.json())
      .then((next: SettingsPayload) => {
        try {
          window.dispatchEvent(
            new CustomEvent(SETTINGS_EVENT, { detail: next }),
          );
        } catch { /* ignore */ }
      })
      .catch(() => {});
  }, []);

  const onAutoGenerate = useCallback((v: boolean) => {
    setAutoGenerate(v);
    persist({ autoGenerate: v });
  }, [persist]);

  const onMaxRetries = useCallback((v: number) => {
    const clamped = Math.min(10, Math.max(0, Math.floor(v)));
    setMaxRetries(clamped);
    persist({ maxRetries: clamped });
  }, [persist]);

  const handlePiProviderChange = useCallback((newProvider: "ollama" | "gemini" | "openai" | "anthropic" | "custom") => {
    setPiProvider(newProvider);
    let url = "";
    let apiType: "openai-completions" | "google-generative-ai" | "anthropic-messages" = "openai-completions";
    let modelFast = "";
    let modelSmart = "";
    
    switch (newProvider) {
      case "ollama":
        url = "http://localhost:11434/v1";
        apiType = "openai-completions";
        modelFast = "qwen2.5-coder:7b";
        modelSmart = "qwen2.5-coder:7b";
        break;
      case "gemini":
        url = "https://generativelanguage.googleapis.com/v1beta";
        apiType = "google-generative-ai";
        modelFast = "gemini-2.5-flash";
        modelSmart = "gemini-2.5-pro";
        break;
      case "openai":
        url = "https://api.openai.com/v1";
        apiType = "openai-completions";
        modelFast = "gpt-4o-mini";
        modelSmart = "gpt-4o";
        break;
      case "anthropic":
        url = "https://api.anthropic.com";
        apiType = "anthropic-messages";
        modelFast = "claude-3-5-haiku";
        modelSmart = "claude-3-5-sonnet";
        break;
      case "custom":
        url = piUrl || "http://localhost:11434/v1";
        apiType = piApiType || "openai-completions";
        modelFast = piModelFast || "llama3.2";
        modelSmart = piModelSmart || "llama3.2";
        break;
    }
    setPiUrl(url);
    setPiApiType(apiType);
    setPiModelFast(modelFast);
    setPiModelSmart(modelSmart);
    persist({
      piProvider: newProvider,
      piUrl: url,
      piApiType: apiType,
      piModelFast: modelFast,
      piModelSmart: modelSmart
    });
  }, [piUrl, piApiType, piModelFast, piModelSmart, persist]);

  const textStateRef = useRef({ piUrl, piApiKey, piModelFast, piModelSmart, codexModelFast, codexModelSmart, codexEffortFast, codexEffortSmart, geminiApiKey, geminiModelFast, geminiModelSmart, claudeModelFast, claudeModelSmart, claudeEffortFast, claudeEffortSmart });
  useEffect(() => {
    textStateRef.current = { piUrl, piApiKey, piModelFast, piModelSmart, codexModelFast, codexModelSmart, codexEffortFast, codexEffortSmart, geminiApiKey, geminiModelFast, geminiModelSmart, claudeModelFast, claudeModelSmart, claudeEffortFast, claudeEffortSmart };
  }, [piUrl, piApiKey, piModelFast, piModelSmart, codexModelFast, codexModelSmart, codexEffortFast, codexEffortSmart, geminiApiKey, geminiModelFast, geminiModelSmart, claudeModelFast, claudeModelSmart, claudeEffortFast, claudeEffortSmart]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const timer = setTimeout(() => {
      persist({ piUrl, piApiKey, piModelFast, piModelSmart, codexModelFast, codexModelSmart, codexEffortFast, codexEffortSmart, geminiApiKey, geminiModelFast, geminiModelSmart, claudeModelFast, claudeModelSmart, claudeEffortFast, claudeEffortSmart });
    }, 500);
    return () => clearTimeout(timer);
  }, [piUrl, piApiKey, piModelFast, piModelSmart, codexModelFast, codexModelSmart, codexEffortFast, codexEffortSmart, geminiApiKey, geminiModelFast, geminiModelSmart, claudeModelFast, claudeModelSmart, claudeEffortFast, claudeEffortSmart, persist]);

  useEffect(() => {
    return () => {
      if (hydratedRef.current) {
        persist(textStateRef.current);
      }
    };
  }, [persist]);

  const getApiKeyPlaceholder = () => {
    switch (piProvider) {
      case "ollama": return "Optional (ignored by Ollama)";
      case "gemini": return "Enter Gemini API Key";
      case "openai": return "Enter OpenAI API Key";
      case "anthropic": return "Enter Anthropic API Key";
      default: return "Enter API Key";
    }
  };

  const onThemeSelect = useCallback(
    (next: "light" | "dark" | "system") => {
      userToggledRef.current = true;
      setTheme(next);
      persist({ theme: next }, true);
      // Apply immediately for snappy feedback; ThemeProvider also reacts to the
      // settings event this dispatches. "system" resolves to the OS preference.
      const wantDark =
        next === "dark" ||
        (next === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", wantDark);
    },
    [persist],
  );

  return (
    <>
      <div className="border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-500)]">
            Settings
          </p>
          <p
            className="text-[10.5px] font-medium tabular-nums text-[var(--ink-400)]"
            aria-label={`Get It. version ${APP_VERSION}`}
          >
            v{APP_VERSION}
          </p>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-400)]">
          Saved automatically. Your choice survives app restarts.
        </p>
      </div>

      <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
        <label className="block text-[12.5px] font-medium text-[var(--ink-900)] mb-2">Model Engine</label>
        {/* Switching engines goes through the setup wizard only — it installs/
            authenticates the new backend and verifies it works before applying.
            A free-floating dropdown here would bypass that and leave a broken
            provider selected, so we show the current engine + a guided Switch. */}
        <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1.5">
          <span className="text-[12px] font-medium text-[var(--ink-900)]">{ENGINE_LABEL[provider]}</span>
          <button
            type="button"
            onClick={() => window.getit?.runCodexSetup?.().catch(() => {})}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 text-[10.5px] font-medium text-[var(--ink-700)] transition hover:border-[var(--accent-300)] hover:text-[var(--accent-700)]"
          >
            <Settings2 className="h-2.5 w-2.5" />
            Switch
          </button>
        </div>
      </div>

      {provider === "gemini" && (
        <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] space-y-3">
          <div>
            <label className="block text-[11.5px] font-medium text-[var(--ink-900)] mb-1">
              Gemini API Key
            </label>
            <input
              type="password"
              placeholder="AIzaSy... (Required for Gemini)"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[12px] text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <EditableModelSelect
              label="Fast Model"
              value={geminiModelFast}
              onChange={setGeminiModelFast}
              options={[
                { value: "gemini-flash-lite-latest", label: "gemini-flash-lite-latest" },
                { value: "gemini-flash-latest", label: "gemini-flash-latest" },
                { value: "gemini-pro-latest", label: "gemini-pro-latest" },
                { value: "gemma-4-26b-a4b-it", label: "gemma-4-26b-a4b-it" },
                { value: "gemma-4-31b-it", label: "gemma-4-31b-it" }
              ]}
            />
            <EditableModelSelect
              label="Smart Model"
              value={geminiModelSmart}
              onChange={setGeminiModelSmart}
              options={[
                { value: "gemini-pro-latest", label: "gemini-pro-latest" },
                { value: "gemini-flash-latest", label: "gemini-flash-latest" },
                { value: "gemini-flash-lite-latest", label: "gemini-flash-lite-latest" },
                { value: "gemma-4-31b-it", label: "gemma-4-31b-it" },
                { value: "gemma-4-26b-a4b-it", label: "gemma-4-26b-a4b-it" }
              ]}
            />
          </div>
        </div>
      )}

      {provider === "claude" && (
        <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] space-y-3">
          <div>
            <label className="block text-[11.5px] font-medium text-[var(--ink-900)] mb-1">
              Claude Authentication
            </label>
            <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
              Sign in with one click from the <strong>Account</strong> menu (top-right). Aliases like <code>sonnet</code> or <code>haiku</code> always map to the current model.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <EditableModelSelect
              label="Fast Model"
              value={claudeModelFast}
              onChange={setClaudeModelFast}
              options={[
                { value: "sonnet", label: "sonnet (recommended)" },
                { value: "haiku", label: "haiku (fastest)" },
                { value: "opus", label: "opus (most capable)" }
              ]}
            />
            <EditableModelSelect
              label="Smart Model"
              value={claudeModelSmart}
              onChange={setClaudeModelSmart}
              options={[
                { value: "sonnet", label: "sonnet (recommended)" },
                { value: "opus", label: "opus (most capable)" },
                { value: "haiku", label: "haiku (fastest)" }
              ]}
            />
            <div>
              <label className="block text-[11px] font-medium text-[var(--ink-900)] mb-1">
                Fast Thinking Effort
              </label>
              <select
                value={claudeEffortFast}
                onChange={(e) => setClaudeEffortFast(e.target.value)}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 text-[11px] text-[var(--ink-900)] shadow-sm focus:border-[var(--accent-500)] focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium (Default for fast)</option>
                <option value="high">High</option>
                <option value="xhigh">X-High</option>
                <option value="max">Max</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--ink-900)] mb-1">
                Smart Thinking Effort
              </label>
              <select
                value={claudeEffortSmart}
                onChange={(e) => setClaudeEffortSmart(e.target.value)}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 text-[11px] text-[var(--ink-900)] shadow-sm focus:border-[var(--accent-500)] focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High (Default for smart)</option>
                <option value="xhigh">X-High</option>
                <option value="max">Max</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {provider === "codex" && (
        <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] space-y-3">
          <div>
            <label className="block text-[11.5px] font-medium text-[var(--ink-900)] mb-1">
              Codex Authentication
            </label>
            <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
              Codex manages its own authentication via browser login.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <EditableModelSelect
              label="Fast Model"
              value={codexModelFast}
              onChange={setCodexModelFast}
              options={[
                { value: "auto", label: "Auto (Let server decide)" },
                { value: "gpt-5.6-luna", label: "gpt-5.6-luna (fastest, affordable)" },
                { value: "gpt-5.6-terra", label: "gpt-5.6-terra (balanced)" },
                { value: "gpt-5.6-sol", label: "gpt-5.6-sol (most capable)" },
                { value: "gpt-5.5", label: "gpt-5.5" }
              ]}
            />
            <EditableModelSelect
              label="Smart Model"
              value={codexModelSmart}
              onChange={setCodexModelSmart}
              options={[
                { value: "auto", label: "Auto (Let server decide)" },
                { value: "gpt-5.6-sol", label: "gpt-5.6-sol (most capable)" },
                { value: "gpt-5.6-terra", label: "gpt-5.6-terra (balanced)" },
                { value: "gpt-5.6-luna", label: "gpt-5.6-luna (fastest)" },
                { value: "gpt-5.5", label: "gpt-5.5" }
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="block text-[11px] font-medium text-[var(--ink-900)] mb-1">
                Fast Thinking Effort
              </label>
              <select
                value={codexEffortFast}
                onChange={(e) => setCodexEffortFast(e.target.value)}
                className="w-full h-[26px] bg-[var(--surface-default)] border border-[var(--border-subtle)] 
                         rounded text-[11.5px] px-2 text-[var(--ink-900)] outline-none 
                         focus:border-[var(--brand-500)] focus:ring-1 focus:ring-[var(--brand-500)]/20 transition-all"
              >
                <option value="minimal">None (Fastest)</option>
                <option value="low">Low (Default for fast)</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">X-High</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--ink-900)] mb-1">
                Smart Thinking Effort
              </label>
              <select
                value={codexEffortSmart}
                onChange={(e) => setCodexEffortSmart(e.target.value)}
                className="w-full h-[26px] bg-[var(--surface-default)] border border-[var(--border-subtle)] 
                         rounded text-[11.5px] px-2 text-[var(--ink-900)] outline-none 
                         focus:border-[var(--brand-500)] focus:ring-1 focus:ring-[var(--brand-500)]/20 transition-all"
              >
                <option value="minimal">None (Fastest)</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High (Default for smart)</option>
                <option value="xhigh">X-High</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {provider === "pi" && (
        <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] space-y-3">
          <div>
            <label className="block text-[11.5px] font-medium text-[var(--ink-900)] mb-1">
              Provider
            </label>
            <select
              value={piProvider}
              onChange={(e) => handlePiProviderChange(e.target.value as NonNullable<SettingsPayload["piProvider"]>)}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 text-[12px] font-medium text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
            >
              <option value="ollama">Ollama (Local)</option>
              <option value="gemini">Google Gemini (AI Studio)</option>
              <option value="openai">OpenAI (ChatGPT/Codex)</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="custom">Custom Endpoint</option>
            </select>
          </div>
          <div>
            <label className="block text-[11.5px] font-medium text-[var(--ink-900)] mb-1">
              API Protocol
            </label>
            <select
              value={piApiType}
              onChange={(e) => {
                setPiApiType(e.target.value as NonNullable<SettingsPayload["piApiType"]>);
                persist({ piApiType: e.target.value as NonNullable<SettingsPayload["piApiType"]> });
              }}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 text-[12px] font-medium text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
            >
              <option value="openai-completions">OpenAI completions</option>
              <option value="google-generative-ai">Google Generative AI</option>
              <option value="anthropic-messages">Anthropic Messages</option>
            </select>
          </div>
          <div>
            <label className="block text-[11.5px] font-medium text-[var(--ink-900)] mb-1">
              API Base URL
            </label>
            <input
              type="text"
              value={piUrl}
              onChange={(e) => setPiUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[12px] font-mono text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-medium text-[var(--ink-900)] mb-1">
              API Key
            </label>
            <input
              type="password"
              value={piApiKey}
              onChange={(e) => setPiApiKey(e.target.value)}
              placeholder={getApiKeyPlaceholder()}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[12px] font-mono text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11.5px] font-medium text-[var(--ink-900)] mb-1">
                Fast Model
              </label>
              <input
                type="text"
                value={piModelFast}
                onChange={(e) => setPiModelFast(e.target.value)}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[12px] font-mono text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[var(--ink-900)] mb-1">
                Smart Model
              </label>
              <input
                type="text"
                value={piModelSmart}
                onChange={(e) => setPiModelSmart(e.target.value)}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[12px] font-mono text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Appearance — light / system / dark */}
      <div className="px-3 py-2.5">
        <p className="mb-2 text-[12.5px] font-medium text-[var(--ink-900)]">
          Appearance
        </p>
        <div
          role="radiogroup"
          aria-label="Appearance"
          className="grid grid-cols-3 gap-1 rounded-md bg-[var(--surface-sunken)] p-1"
        >
          {([
            { value: "light", label: "Light", Icon: Sun },
            { value: "system", label: "System", Icon: Monitor },
            { value: "dark", label: "Dark", Icon: Moon },
          ] as const).map(({ value, label, Icon }) => {
            const active = selectedTheme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onThemeSelect(value)}
                className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11.5px] font-medium transition-colors ${
                  active
                    ? "bg-[var(--surface-raised)] text-[var(--ink-900)] shadow-sm ring-1 ring-inset ring-[var(--border-default)]"
                    : "text-[var(--ink-500)] hover:text-[var(--ink-900)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-500)]">
          {selectedTheme === "system"
            ? `Follows your system — currently ${osPrefersDark ? "dark" : "light"}.`
            : selectedTheme === "dark"
              ? "Dark theme active."
              : "Light theme active."}
        </p>
      </div>

      {/* Auto-generate toggle */}
      <div className="flex items-start gap-2.5 border-t border-[var(--border-subtle)] px-3 py-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={autoGenerate}
          onClick={() => onAutoGenerate(!autoGenerate)}
          className={`mt-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
            autoGenerate
              ? "bg-[var(--accent-600)]"
              : "bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--border-default)]"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
              autoGenerate ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-[var(--ink-900)]">
            Auto-generate visualizations
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
            {autoGenerate
              ? "Every detected tag fires its viz generation in parallel."
              : "Tags appear after detection but only render on click."}
          </p>
        </div>
      </div>

      {/* Max retries number input */}
      <div className="flex items-start gap-2.5 border-t border-[var(--border-subtle)] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-[var(--ink-900)]">
            Max viz repair attempts
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
            Extra calls after a runtime error. Total attempts per tag = 1 + this.
          </p>
        </div>
        <input
          type="number"
          min={0}
          max={10}
          step={1}
          value={maxRetries}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 0) onMaxRetries(n);
          }}
          className="h-7 w-14 shrink-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 text-right text-[12.5px] font-medium tabular-nums text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
        />
      </div>
    </>
  );
}
