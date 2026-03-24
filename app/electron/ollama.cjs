const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'llama3.2';

function buildPrompt(context, userQuery = null) {
  const history = context.history.length > 0
    ? context.history.join('\n')
    : 'No previous commands';

  if (userQuery) {
    return `You are a cybersecurity terminal assistant. Answer this question using the terminal session context below.

Question: ${userQuery}

Command: ${context.currentCommand}
Working directory: ${context.cwd}
Recent history:
${history}

Terminal output:
${context.currentOutput}

Respond in JSON with this exact structure:
{"explanation": "...", "security_implications": "...", "next_steps": "..."}
Only return JSON. No markdown, no extra text.`;
  }

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
  const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

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
    currentOutput: context.currentOutput.slice(0, 2000)
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
