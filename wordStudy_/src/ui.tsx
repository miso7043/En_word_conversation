import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type IconName = 'play' | 'pause' | 'stop' | 'next' | 'up' | 'down' | 'settings' | 'list' | 'chat' | 'read' | 'moon' | 'sun' | 'system' | 'close';
export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="4" /></>,
    stop: <rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" stroke="none" />,
    next: <><path d="m3 5 9 7-9 7Zm9 0 9 7-9 7Z" fill="currentColor" stroke="none" /></>,
    up: <path d="M12 20V4m-7 7 7-7 7 7" />,
    down: <path d="M12 4v16m-7-7 7 7 7-7" />,
    settings: <><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 3 3-1 1-3 3-1 1-3-3-2V6l-3-2-2 2Z" /><circle cx="11" cy="11" r="3" /></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1" /></>,
    chat: <><path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z" /><path d="M7 9h10M7 13h7" /></>,
    read: <><path d="M12 5v16M12 5C9 3 5 3 2 5v15c3-2 7-2 10 1 3-3 7-3 10-1V5c-3-2-7-2-10 0Z" /></>,
    moon: <path d="M20 15A9 9 0 0 1 9 4 9 9 0 1 0 20 15Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
    system: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4m-5 0h10" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; sequence: number; target: Element } | null>(null);
  const notify = useCallback((message: string) => setToast(previous => ({ message, sequence: (previous?.sequence ?? 0) + 1, target: document.querySelector('dialog[open]') ?? document.body })), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  return <ToastContext.Provider value={notify}>{children}{createPortal(<div className="setting-toast" role="status" aria-live="polite" aria-atomic="true">{toast && <span key={toast.sequence}>{toast.message}</span>}</div>, toast?.target ?? document.body)}</ToastContext.Provider>;
}
