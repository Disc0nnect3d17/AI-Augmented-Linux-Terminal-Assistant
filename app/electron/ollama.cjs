// ── AREA 4: Ollama Prompt Construction ────────────────────────────────────
// Ollama runs locally at port 11434. All inference stays on-device — no data
// leaves the machine. MODEL is the local llama3.2 checkpoint.
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'llama3.2';

// Assembles the full prompt string that gets sent to Ollama.
// This is where the structured context object from Area 1 is injected into
// natural language — the implementation of structured prompting from the literature review.
// Two variants: auto-explain (no userQuery) and @-prefix Q&A (with userQuery).
function buildPrompt(context, userQuery = null) {
  // Flatten the history array into newline-separated text for the prompt
  const history = context.history.length > 0
    ? context.history.join('\n')
    : 'No previous commands';

  // Variant A — @-prefix Q&A: user asked a specific question
  // The context object fields are injected directly as labelled sections
  if (userQuery) {
    return `You are an expert cybersecurity terminal assistant. Answer the following question accurately using the terminal session context provided. Do not guess or hallucinate — if you don't know, say so.

Question: ${userQuery}

Current session context:
Command just run: ${context.currentCommand}
Working directory: ${context.cwd}
Recent history: ${history}
Last terminal output:
${context.currentOutput.slice(0, 1000)}

Respond in JSON:
{"explanation": "direct answer to the question", "security_implications": "relevant security context", "next_steps": "recommended actions"}
Only return JSON. No markdown, no extra text.`;
// ↑ Constrained JSON-only output format prevents free-text drift and makes
//   the response trivially parseable — parseability was a key design requirement.
  }

  // Variant B — auto-explain: triggered automatically after every command
  // Same context fields, different task framing (analysis vs Q&A)
  return `You are an expert cybersecurity terminal assistant analysing Linux command output.

Command: ${context.currentCommand}
Working directory: ${context.cwd}
Recent history:
${history}

Terminal output:
${context.currentOutput || '(no output — command may have failed or produced nothing)'}

Provide a concise technical analysis. Respond in JSON:
{"explanation": "what the command did and what the output means", "security_implications": "specific security risks or observations, or 'No significant security implications' if none", "next_steps": "specific actionable next steps for a cybersecurity workflow"}
Only return JSON. No markdown, no extra text.`;
}

function buildScriptPrompt(request, context) {
  return `You are an expert cybersecurity and Linux systems engineer. Generate a correct, working bash script for the following request.

Request: ${request}
Working directory: ${context.cwd}

Rules:
- Write a complete, functional bash script
- Use best practices and correct syntax
- Include comments explaining each step
- Do NOT suggest running the script automatically
- If the request involves network scanning, use nmap
- If the request involves process inspection, use ps, top, or lsof

Respond in JSON with this exact structure:
{"script": "#!/bin/bash\\n# script here", "description": "one sentence description", "warning": "any safety warning or empty string"}
Only return JSON. No markdown, no extra text.`;
}

async function queryOllama(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, stream: false }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json();
    const text = data.response.trim();
    try {
      return { success: true, data: JSON.parse(text) };
    } catch {
      return { success: true, data: { explanation: text, security_implications: '', next_steps: '' } };
    }
  } catch (err) {
    clearTimeout(timeout);
    return { success: false, error: err.message };
  }
}

async function explainOutput(context) {
  const truncatedContext = {
    ...context,
    currentOutput: context.currentOutput.slice(0, 1000)
  }
  const prompt = buildPrompt(truncatedContext);
  return queryOllama(prompt);
}

async function answerQuery(userQuery, context) {
  const prompt = buildPrompt(context, userQuery);
  return queryOllama(prompt);
}

async function generateScript(request, context) {
  const prompt = buildScriptPrompt(request, context);
  return queryOllama(prompt);
}

module.exports = { explainOutput, answerQuery, generateScript };