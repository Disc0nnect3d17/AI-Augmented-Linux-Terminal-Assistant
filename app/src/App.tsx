import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

export default function App() {
  const terminalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      theme: {
        background: "#0b0f14",
      },
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    if (terminalRef.current) {
      term.open(terminalRef.current);
      fitAddon.fit();
    }

    // Start PTY
    window.pty.start();

    // Stream shell output to xterm
    window.pty.onData((data: string) => {
      term.write(data);
    });

    // Send user input to PTY
    term.onData((data) => {
      window.pty.write(data);
    });

    // Handle resize
    window.addEventListener("resize", () => {
      fitAddon.fit();
    });

    return () => {
      term.dispose();
    };
  }, []);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <div ref={terminalRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}