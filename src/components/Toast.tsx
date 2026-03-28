import { useState, useEffect } from "react";

interface ToastMessage {
  id: number;
  text: string;
}

let toastId = 0;
const listeners: Set<(msg: ToastMessage) => void> = new Set();

/** Show a toast from anywhere. */
export function showToast(text: string) {
  const msg = { id: ++toastId, text };
  listeners.forEach((fn) => fn(msg));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setToasts((prev) => [...prev, msg]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== msg.id));
      }, 1500);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            color: "oklch(0.85 0 0)",
            backgroundColor: "oklch(0.2 0 0 / 0.85)",
            padding: "6px 12px",
            borderRadius: 4,
            backdropFilter: "blur(8px)",
            whiteSpace: "nowrap",
          }}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
