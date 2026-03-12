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

  return `You are a cybersecurity terminal assistant. Explain the following command output.

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

function buildScriptPrompt(request, context) {
  return `You are a cybersecurity terminal assistant. Generate a bash script for the following request.

Request: ${request}
Working directory: ${context.cwd}

Respond in JSON with this exact structure:
{"script": "...", "description": "...", "warning": "..."}
Only return JSON. No markdown, no extra text.`;
}

async function queryOllama(prompt) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false
    })
  });

  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

  const data = await response.json();
  const text = data.response.trim();

  try {
    return { success: true, data: JSON.parse(text) };
  } catch {
    return { success: true, data: { explanation: text, security_implications: '', next_steps: '' } };
  }
}

async function explainOutput(context) {
  const prompt = buildPrompt(context);
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
