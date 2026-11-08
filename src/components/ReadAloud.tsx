import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { parseCommand, type Chunk, type Command } from "../lib/speech";

const GAP_AFTER_INGREDIENT = 1500; // ms of quiet to add the ingredient before going on
const GAP = 350;

/**
 * Reads a step aloud, one phrase at a time, and never moves to the next step
 * by itself. Pause stops speaking at once; Continue restarts the phrase it was
 * on, so nothing is missed.
 */
export function useReader() {
  const [state, setState] = useState<"idle" | "speaking" | "paused">("idle");
  // "Wait for my tap": stop after each ingredient until the cook taps to go on.
  const [waitForTap, setWaitForTapState] = useState(() => {
    try {
      return localStorage.getItem("recipe-builder.waitForTap") === "1";
    } catch {
      return false;
    }
  });
  const waitRef = useRef(waitForTap);
  waitRef.current = waitForTap;
  const [waiting, setWaiting] = useState(false);
  const chunks = useRef<Chunk[]>([]);
  const at = useRef(0);
  const run = useRef(0); // invalidates callbacks from an earlier play
  const timer = useRef<number | undefined>(undefined);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stopSpeech = () => {
    run.current++;
    window.clearTimeout(timer.current);
    if (supported) window.speechSynthesis.cancel();
  };

  const playFrom = useCallback(
    (i: number) => {
      stopSpeech();
      const myRun = run.current;
      at.current = i;
      if (i >= chunks.current.length) return setState("idle");
      setState("speaking");
      setWaiting(false);
      const u = new SpeechSynthesisUtterance(chunks.current[i].text);
      u.rate = 0.95;
      u.onend = () => {
        if (run.current !== myRun) return;
        if (chunks.current[i].afterIngredient && waitRef.current && i + 1 < chunks.current.length) {
          at.current = i + 1; // tapping continues with what comes next
          setWaiting(true);
          setState("paused");
          return;
        }
        const gap = chunks.current[i].afterIngredient ? GAP_AFTER_INGREDIENT : GAP;
        timer.current = window.setTimeout(() => run.current === myRun && playFrom(i + 1), gap);
      };
      u.onerror = () => run.current === myRun && setState("idle");
      window.speechSynthesis.speak(u);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => () => stopSpeech(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    supported,
    state,
    /** Stopped after an ingredient, waiting for a tap. */
    waiting,
    waitForTap,
    setWaitForTap(v: boolean) {
      setWaitForTapState(v);
      try {
        localStorage.setItem("recipe-builder.waitForTap", v ? "1" : "0");
      } catch {
        /* session only */
      }
    },
    /** What's being said right now (so voice commands can ignore the phone's own words). */
    current: () => (state === "speaking" ? chunks.current[at.current]?.text ?? "" : ""),
    read(next: Chunk[]) {
      chunks.current = next;
      playFrom(0);
    },
    pause() {
      stopSpeech();
      setWaiting(false);
      setState(chunks.current.length && at.current < chunks.current.length ? "paused" : "idle");
    },
    resume: () => playFrom(at.current),
    repeat: () => playFrom(0),
    stop() {
      stopSpeech();
      setState("idle");
    },
  };
}

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

/**
 * Listens for "pause / stop / wait", "continue", "next", "back", "repeat".
 * Uses the browser's speech recognition where available (Safari has it; some
 * browsers don't). iPhones end listening every so often, so it restarts.
 */
export function useVoiceCommands(onCommand: (c: Command) => void, nowSpeaking: () => string) {
  const Ctor =
    typeof window !== "undefined"
      ? ((window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
          .SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition)
      : undefined;
  const [on, setOn] = useState(false);
  const [problem, setProblem] = useState("");
  const [heard, setHeard] = useState("");
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const last = useRef<{ cmd: string; at: number }>({ cmd: "", at: 0 });
  const handler = useRef(onCommand);
  handler.current = onCommand;
  const speaking = useRef(nowSpeaking);
  speaking.current = nowSpeaking;

  const start = useCallback(() => {
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true; // react to "stop" without waiting for the end of a sentence
    r.lang = "en-US";
    r.onresult = (e) => {
      const latest = e.results[e.results.length - 1];
      const text = latest[0].transcript;
      const cmd = parseCommand(text, speaking.current());
      // The same word is reported several times while it's being said; act on it once.
      // A different command ("next" … "stop!") always goes through.
      if (!cmd || (cmd === last.current.cmd && Date.now() - last.current.at < 1500)) return;
      last.current = { cmd, at: Date.now() };
      setHeard(cmd);
      handler.current(cmd);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        wanted.current = false;
        setOn(false);
        setProblem(
          e.error === "service-not-allowed"
            ? "This browser doesn't let websites use speech recognition, so voice commands can't work here (they do in Safari). Use “Wait for my tap” instead."
            : e.error === "audio-capture"
              ? "No microphone could be used. Check that nothing else is using it, or use “Wait for my tap” instead."
              : "The microphone is blocked for this browser. On iPhone: Settings → Apps → (your browser) → turn on Microphone, then try again. Or use “Wait for my tap” instead.",
        );
      }
    };
    r.onend = () => {
      if (wanted.current) {
        try {
          r.start();
        } catch {
          /* already started */
        }
      }
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      setProblem("Couldn't start listening. Use the buttons instead.");
    }
  }, [Ctor]);

  const toggle = () => {
    if (!Ctor) return;
    if (on) {
      wanted.current = false;
      rec.current?.abort();
      setOn(false);
    } else {
      setProblem("");
      wanted.current = true;
      setOn(true);
      start();
    }
  };

  useEffect(
    () => () => {
      wanted.current = false;
      rec.current?.abort();
    },
    [],
  );

  return { supported: !!Ctor, on, toggle, problem, heard };
}

/** The read-aloud and voice bar shown in cooking mode. */
export function ReadAloudBar({
  reader,
  voice,
  onToggleRead,
  reading,
}: {
  reader: ReturnType<typeof useReader>;
  voice: ReturnType<typeof useVoiceCommands>;
  onToggleRead: () => void;
  reading: boolean;
}) {
  if (!reader.supported) return null;
  return (
    <div className="read-bar">
      <div className="read-controls">
        <button className={reading ? "btn read-toggle on" : "btn read-toggle"} onClick={onToggleRead} aria-pressed={reading}>
          <Icon name="speaker" size={18} /> Read aloud
        </button>
        {reading && (
          <>
            {reader.state === "speaking" ? (
              <button className="btn" onClick={reader.pause}>
                <Icon name="pause" size={18} /> Pause
              </button>
            ) : (
              <button className="btn" onClick={reader.state === "paused" ? reader.resume : reader.repeat}>
                <Icon name="play" size={18} /> {reader.state === "paused" ? "Continue" : "Read again"}
              </button>
            )}
            {reader.state !== "idle" && (
              <button className="btn" onClick={reader.repeat} aria-label="Repeat this step">
                <Icon name="reset" size={18} />
              </button>
            )}
          </>
        )}
      </div>
      {reading && (
        <label className="check-line wait-tap">
          <input type="checkbox" checked={reader.waitForTap} onChange={(e) => reader.setWaitForTap(e.target.checked)} />
          <span>
            Wait for my tap after each ingredient <span className="muted small">(no microphone needed)</span>
          </span>
        </label>
      )}
      {reading && (
        <div className="voice-row">
          {voice.supported ? (
            <>
              <button className={voice.on ? "link-btn small voice-on" : "link-btn small"} onClick={voice.toggle} aria-pressed={voice.on}>
                <Icon name="mic" size={16} /> {voice.on ? "Voice commands on" : "Turn on voice commands"}
              </button>
              {voice.on && (
                <span className="muted small">
                  Say “pause”, “continue”, “next”, “back” or “repeat”{voice.heard ? ` · heard “${voice.heard}”` : ""}
                </span>
              )}
            </>
          ) : (
            <span className="muted small">Voice commands aren't available in this browser — use the buttons. (They work in Safari.)</span>
          )}
          {voice.problem && <span className="small error-text">{voice.problem}</span>}
        </div>
      )}
    </div>
  );
}
