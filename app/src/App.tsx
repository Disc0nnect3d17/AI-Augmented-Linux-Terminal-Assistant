import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

interface AiResult {
  explanation: string
  security_implications: string
  next_steps: string
}

interface ScriptResult {
  script: string
  description: string
  warning: string
}

type PanelContent =
  | { type: 'idle' }
  | { type: 'loading'; command?: string }
  | { type: 'explanation'; data: AiResult; command: string; risk: RiskAssessment }
  | { type: 'script'; data: ScriptResult; request: string; risk: RiskAssessment }
  | { type: 'error'; message: string }

function ScriptSaveButton({ script, request, cwd }: { script: string; request: string; cwd: string }) {
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const res = await window.script.save(script, request, cwd)
    if (res.success) {
      setSaved(res.path!)
    } else {
      setError(res.error || 'Failed to save')
    }
  }

  if (saved) {
    return (
      <div style={{ marginTop: '10px', fontSize: '11px', color: '#4ec9b0' }}>
        ✓ Saved as {saved}
      </div>
    )
  }

  return (
    <div style={{ marginTop: '10px' }}>
      <button
        onClick={handleSave}
        style={{
          background: '#1a3a2a',
          border: '1px solid #2e7d6e',
          color: '#4ec9b0',
          padding: '6px 14px',
          borderRadius: '4px',
          fontSize: '11px',
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: '0.05em'
        }}
      >
        Create Script
      </button>
      {error && <span style={{ marginLeft: '10px', color: '#e06c75', fontSize: '11px' }}>{error}</span>}
    </div>
  )
}

function useTypewriter(text: string, speed = 18) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    setDisplayed('')
    if (!text) return
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(interval)
    }, speed)
    return () => clearInterval(interval)
  }, [text, speed])
  return displayed
}

export default function App() {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const prefixActiveRef = useRef(false)
  const lastContextRef = useRef<any>(null)
  const [panel, setPanel] = useState<PanelContent>({ type: 'idle' })
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string } | null>(null)
  const [layout, setLayout] = useState<'right' | 'left' | 'top' | 'bottom'>(() => {
    return (localStorage.getItem('ai-panel-layout') as any) || 'right'
  })

  const setAndSaveLayout = (l: 'right' | 'left' | 'top' | 'bottom') => {
    setLayout(l)
    localStorage.setItem('ai-panel-layout', l)
    setTimeout(() => fitRef.current?.fit(), 50)
  }

  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0
  }, [panel])

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'monospace',
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termRef.current!)
    fit.fit()
    xtermRef.current = term
    fitRef.current = fit

    window.pty.start(term.cols, term.rows)
    window.pty.onData((data) => term.write(data))
    term.onData((data) => window.pty.write(data))

    // Right-click context menu on selected text
    termRef.current!.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      const selection = term.getSelection().trim()
      if (!selection) return
      setContextMenu({ x: e.clientX, y: e.clientY, text: selection })
    })

    const dismissMenu = () => setContextMenu(null)
    window.addEventListener('click', dismissMenu)

    // Auto-explain after every command
    window.pty.onContextReady((ctx) => {
      lastContextRef.current = ctx
      if (prefixActiveRef.current) return
      console.log('Context captured:', ctx)
      if (!ctx.currentCommand) return
      const skipCommands = ['cd', 'clear', 'exit', 'history', 'pwd']
      if (skipCommands.includes(ctx.currentCommand.trim().split(' ')[0])) return
      setPanel({ type: 'loading', command: ctx.currentCommand })
      window.ai.explain(ctx).then((res) => {
        if (res.success) {
          setPanel({ type: 'explanation', data: res.data as AiResult, command: ctx.currentCommand, risk: res.risk || { tier: 'SAFE' } })
        } else {
          setPanel({ type: 'error', message: 'Ollama failed to respond.' })
        }
      }).catch(() => setPanel({ type: 'error', message: 'Could not reach Ollama.' }))
    })

    // Handle @ and # prefix queries
    window.pty.onAiQuery((payload) => {
      prefixActiveRef.current = true
      setPanel({ type: 'loading' })
      if (payload.type === 'query') {
        window.ai.query(payload.input, payload.context).then((res) => {
          prefixActiveRef.current = false
          if (res.success) {
            setPanel({ type: 'explanation', data: res.data as AiResult, command: payload.input, risk: res.risk || { tier: 'SAFE' } })
          } else {
            setPanel({ type: 'error', message: 'Ollama failed to respond.' })
          }
        }).catch(() => {
          prefixActiveRef.current = false
          setPanel({ type: 'error', message: 'Could not reach Ollama.' })
        })
      } else {
        window.ai.script(payload.input, payload.context).then((res) => {
          prefixActiveRef.current = false
          if (res.success) {
            setPanel({ type: 'script', data: res.data as ScriptResult, request: payload.input, risk: res.risk || { tier: 'SAFE' } })
          } else {
            setPanel({ type: 'error', message: 'Script generation failed.' })
          }
        }).catch(() => {
          prefixActiveRef.current = false
          setPanel({ type: 'error', message: 'Could not reach Ollama.' })
        })
      }
    })

    // Inject scrollbar styles
    const style = document.createElement('style')
    style.textContent = `
      * { box-sizing: border-box; }
      body { margin: 0; overflow: hidden; }
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: #444; }
      .xterm-viewport::-webkit-scrollbar { width: 6px; }
      .xterm-viewport::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    `
    document.head.appendChild(style)

    const handleResize = () => fit.fit()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('click', dismissMenu)
    }
  }, [])

  const askAboutSelection = (text: string) => {
    setContextMenu(null)
    setPanel({ type: 'loading' })
    const ctx = lastContextRef.current || { currentCommand: '', currentOutput: '', cwd: '~', history: [] }
    window.ai.query(text, ctx).then((res) => {
      if (res.success) {
        setPanel({ type: 'explanation', data: res.data as AiResult, command: text, risk: res.risk || { tier: 'SAFE' } })
      } else {
        setPanel({ type: 'error', message: 'Ollama failed to respond.' })
      }
    }).catch(() => setPanel({ type: 'error', message: 'Could not reach Ollama.' }))
  }

  const isHorizontal = layout === 'right' || layout === 'left'

  const layoutButtons = (
    <div style={{ display: 'flex', gap: '4px' }}>
      {(['left', 'right', 'top', 'bottom'] as const).map(pos => (
        <button
          key={pos}
          onClick={() => setAndSaveLayout(pos)}
          style={{
            background: layout === pos ? '#3a3a3a' : 'transparent',
            border: '1px solid ' + (layout === pos ? '#555' : '#2a2a2a'),
            color: layout === pos ? '#aaa' : '#444',
            borderRadius: '3px',
            padding: '2px 6px',
            fontSize: '11px',
            cursor: 'pointer',
            lineHeight: 1
          }}
        >
          {pos === 'left' ? '⬅' : pos === 'right' ? '➡' : pos === 'top' ? '⬆' : '⬇'}
        </button>
      ))}
    </div>
  )

  return (
    <div style={{
      display: 'flex',
      flexDirection: layout === 'top' ? 'column-reverse' : layout === 'bottom' ? 'column' : layout === 'left' ? 'row-reverse' : 'row',
      height: '100vh',
      background: '#1e1e1e',
      color: '#d4d4d4',
      fontFamily: 'monospace',
      overflow: 'hidden'
    }}>
      {/* Terminal Panel */}
      <div style={{ flex: 1, padding: '8px', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '10px', color: '#444', marginBottom: '4px', paddingLeft: '4px', letterSpacing: '0.1em' }}>
          TERMINAL
        </div>
        <div ref={termRef} style={{ flex: 1, minHeight: 0 }} />
      </div>

      {/* Divider */}
      <div style={{ [isHorizontal ? 'width' : 'height']: '1px', background: '#2a2a2a', flexShrink: 0 }} />

      {/* AI Panel */}
      <div style={{
        [isHorizontal ? 'width' : 'height']: isHorizontal ? '420px' : '45vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        flexShrink: 0
      }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ fontSize: '10px', color: '#444', letterSpacing: '0.1em', flexShrink: 0 }}>
            AI ASSISTANT — <span style={{ color: '#3a6a9a' }}>@question</span> <span style={{ color: '#333' }}>|</span> <span style={{ color: '#2e7d6e' }}>#script</span>
          </div>
          {layoutButtons}
        </div>
        <div ref={panelRef} style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          {panel.type === 'idle' && (
            <div style={{ color: '#383838', fontSize: '12px', marginTop: '60px', textAlign: 'center' }}>
              Run a command to see an AI explanation.
            </div>
          )}

          {panel.type === 'loading' && (
            <div style={{ color: '#3a6a9a', fontSize: '12px', marginTop: '60px', textAlign: 'center' }}>
              Analysing {panel.command ? `'${panel.command}'` : ''}...
            </div>
          )}

          {panel.type === 'error' && (
            <div style={{ color: '#8b3333', fontSize: '12px', padding: '10px 12px', background: '#2a1a1a', borderLeft: '2px solid #5a2222', borderRadius: '2px' }}>
              {panel.message}
            </div>
          )}

          {panel.type === 'explanation' && (
            <div style={{ fontSize: '12px', lineHeight: '1.7' }}>
              <div style={{ color: '#3a6a9a', marginBottom: '14px', fontSize: '12px' }}>
                $ {panel.command}
              </div>
              <RiskBanner risk={panel.risk} />
              <Section title="Explanation" color="#c0c0c0" content={panel.data.explanation} />
              <Section title="Security Implications" color="#8a6a50" content={panel.data.security_implications} />
              <Section title="Next Steps" color="#2e7d6e" content={panel.data.next_steps} />
            </div>
          )}

          {panel.type === 'script' && (
            <div style={{ fontSize: '12px', lineHeight: '1.7' }}>
              <div style={{ color: '#2e7d6e', marginBottom: '14px', fontSize: '12px' }}>
                # {panel.request}
              </div>
              <RiskBanner risk={panel.risk} />
              <Section title="Description" color="#c0c0c0" content={panel.data.description} />
              {panel.data.warning && (
                <Section title="Warning" color="#8b3333" content={panel.data.warning} />
              )}
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ color: '#383838', fontSize: '10px', letterSpacing: '0.1em' }}>SCRIPT — copy and run manually</div>
                  <button
                    onClick={() => navigator.clipboard.writeText(panel.data.script)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #333',
                      color: '#555',
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontFamily: 'monospace'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#888')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#555')}
                  >
                    copy
                  </button>
                </div>
                <pre style={{ background: '#191919', padding: '12px', borderRadius: '3px', overflowX: 'auto', color: '#ce9178', fontSize: '11px', margin: 0, lineHeight: '1.6' }}>
                  {panel.data.script}
                </pre>
              </div>
              <ScriptSaveButton
                script={panel.data.script}
                request={panel.request}
                cwd={lastContextRef.current?.cwd || '~'}
              />
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <div style={{
          position: 'fixed',
          top: contextMenu.y,
          left: contextMenu.x,
          background: '#252525',
          border: '1px solid #333',
          borderRadius: '4px',
          padding: '4px 0',
          zIndex: 9999,
          minWidth: '160px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}>
          <div
            onClick={() => askAboutSelection(contextMenu.text)}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              color: '#ccc',
              cursor: 'pointer',
              fontFamily: 'monospace'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2e2e2e')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Ask AI about selection
          </div>
        </div>
      )}
    </div>
  )
}

function RiskBanner({ risk }: { risk: { tier: string; message?: string } }) {
  if (risk.tier === 'SAFE') return null
  const isDanger = risk.tier === 'DANGER'
  return (
    <div style={{
      padding: '8px 12px',
      marginBottom: '14px',
      borderLeft: `2px solid ${isDanger ? '#8b2222' : '#7a6000'}`,
      background: isDanger ? '#2a1010' : '#1e1a00',
      color: isDanger ? '#cc4444' : '#aa8800',
      fontSize: '11px',
      lineHeight: '1.5'
    }}>
      {isDanger ? 'DANGER' : 'CAUTION'} — {risk.message}
    </div>
  )
}

function Section({ title, color, content }: { title: string; color: string; content: string }) {
  const displayed = useTypewriter(content)
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ color: '#383838', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '4px' }}>{title.toUpperCase()}</div>
      <div style={{ color }}>{displayed}</div>
    </div>
  )
}
