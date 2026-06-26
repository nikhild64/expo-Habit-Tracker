/**
 * Universal toast/snackbar system.
 *
 * Replaces ad-hoc `Animated.Value` toasts scattered through screens and
 * provides a clean call site for non-blocking feedback (success / error / info)
 * with an optional action button (e.g. "Undo").
 *
 * Queue model: at most one toast is visible at a time. If `show()` is called
 * while another toast is up, the new one is queued and appears after dismiss.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Display duration in ms. Defaults: success/info 3500, error 5000. */
  duration?: number;
};

type ShowOpts = {
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
};

type ToastContextValue = {
  current: Toast | null;
  show: (message: string, kind: ToastKind, opts?: ShowOpts) => void;
  success: (message: string, opts?: ShowOpts) => void;
  error: (message: string, opts?: ShowOpts) => void;
  info: (message: string, opts?: ShowOpts) => void;
  dismiss: () => void;
};

const ToastContext = createContext<ToastContextValue>({
  current: null,
  show: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  dismiss: () => {},
});

let _id = 0;
const newId = () => `t_${++_id}_${Date.now()}`;

const defaultDuration = (kind: ToastKind): number =>
  kind === 'error' ? 5000 : 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(null);
  const queueRef = useRef<Toast[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Forward-declare so `dismiss` and `show` can reference each other safely.
  const showRef = useRef<(message: string, kind: ToastKind, opts?: ShowOpts) => void>(() => {});

  const dismiss = useCallback(() => {
    clearTimer();
    setCurrent(null);
    // After exit animation, pull next from queue.
    setTimeout(() => {
      const next = queueRef.current.shift();
      if (next) {
        setCurrent(next);
        timeoutRef.current = setTimeout(() => dismiss(), next.duration ?? defaultDuration(next.kind));
      }
    }, 220);
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind, opts: ShowOpts = {}) => {
      const toast: Toast = {
        id: newId(),
        kind,
        message,
        actionLabel: opts.actionLabel,
        onAction: opts.onAction,
        duration: opts.duration,
      };
      if (current) {
        queueRef.current.push(toast);
        return;
      }
      setCurrent(toast);
      clearTimer();
      timeoutRef.current = setTimeout(() => dismiss(), toast.duration ?? defaultDuration(kind));
    },
    [current, dismiss],
  );

  // Keep the latest `show` accessible from short helpers.
  showRef.current = show;

  useEffect(() => () => clearTimer(), []);

  const success = useCallback((m: string, o?: ShowOpts) => showRef.current(m, 'success', o), []);
  const error   = useCallback((m: string, o?: ShowOpts) => showRef.current(m, 'error',   o), []);
  const info    = useCallback((m: string, o?: ShowOpts) => showRef.current(m, 'info',    o), []);

  return (
    <ToastContext.Provider value={{ current, show, success, error, info, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
