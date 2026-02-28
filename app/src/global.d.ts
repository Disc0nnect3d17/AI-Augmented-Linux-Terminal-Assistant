export {};

interface PtyApi {
  start: () => Promise<void>;
  write: (input: string) => Promise<void>;
  onData: (callback: (data: string) => void) => void;
}

declare global {
  interface Window {
    pty: PtyApi;
  }
}
