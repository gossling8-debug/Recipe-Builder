/** Times mentioned in a step ("15 minutes", "8–10 min", "1 hour", "1½ hours"), offered as one-tap timers. */
export interface FoundTimer {
  label: string; // as written, e.g. "8–10 minutes"
  seconds: number; // for a range, the lower end (check early, add more if needed)
}

const NUM = String.raw`(\d+(?:\.\d+)?(?:\s*½)?|½)`;
const TIME = new RegExp(
  String.raw`${NUM}(?:\s*(?:-|–|to)\s*${NUM})?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b`,
  "gi",
);

const num = (s: string) => {
  const t = s.replace(/\s+/g, "");
  if (t === "½") return 0.5;
  return t.endsWith("½") ? Number(t.slice(0, -1)) + 0.5 : Number(t);
};

export function findTimers(text: string): FoundTimer[] {
  const out: FoundTimer[] = [];
  for (const m of text.matchAll(TIME)) {
    const unit = m[3].toLowerCase();
    const mult = unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1;
    const seconds = Math.round(num(m[1]) * mult);
    // Skip silly values (e.g. "0 minutes") and anything over 12 hours.
    if (seconds < 5 || seconds > 12 * 3600) continue;
    if (!out.some((t) => t.seconds === seconds)) out.push({ label: m[0].trim(), seconds });
  }
  return out;
}

/** 905 → "15:05", 3725 → "1:02:05" */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// ---------- alarm sound ----------
// iPhones only allow sound after a tap, so the audio is "unlocked" when a
// timer is started, and the same context plays the alarm later.
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Three short chimes. Silent if the phone blocks audio (e.g. silent mode). */
export function chime(): void {
  try {
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime + 0.05;
    [0, 0.35, 0.7].forEach((offset) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.28);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.3);
    });
    navigator.vibrate?.([200, 120, 200, 120, 200]);
  } catch {
    /* no sound available */
  }
}
