export {};

interface SessionContext {
  currentCommand: string;
  currentOutput: string;
  cwd: string;
  history: string[];
}

interface AiQueryPayload {
  type: 'query' | 'script';
  input: string;
  context: SessionContext;
}

interface PtyApi {
  start: (cols?: number, rows?: number) => void;
  write: (input: string) => void;
  onData: (callback: (data: string) => void) => void;
  onContextReady: (callback: (ctx: SessionContext) => void) => void;
  onAiQuery: (callback: (payload: AiQueryPayload) => void) => void;
  getContext: () => Promise<SessionContext>;
}

interface AiExplainResult {
  explanation: string;
  security_implications: string;
  next_steps: string;
}

interface AiScriptResult {
  script: string;
  description: string;
  warning: string;
}

interface AiResponse<T> {
  success: boolean;
  data: T;
  risk?: RiskAssessment;
}

interface AiApi {
  explain: (ctx: SessionContext) => Promise<AiResponse<AiExplainResult>>;
  query: (input: string, ctx: SessionContext) => Promise<AiResponse<AiExplainResult>>;
  script: (input: string, ctx: SessionContext) => Promise<AiResponse<AiScriptResult>>;
}

declare global {
  interface RiskAssessment {
    tier: 'SAFE' | 'CAUTION' | 'DANGER';
    message?: string;
  }

  interface ScriptApi {
    save: (script: string, filename: string, cwd: string) => Promise<{ success: boolean; path?: string; filename?: string; error?: string }>
  }

  interface Window {
    pty: PtyApi;
    ai: AiApi;
    script: ScriptApi;
  }
}
