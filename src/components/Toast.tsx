import { useCallback, useEffect, useRef, useState } from "react";

/** A short message that fades after a couple of seconds ("Copied", "Added to list"). */
export function useToast() {
  const [message, setMessage] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(""), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const toast = message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null;
  return [toast, show] as const;
}
