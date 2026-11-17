import { useEffect, useId, useState } from "react";

// The C from the Cardamix logo (public/logo.svg).
const C_PATH =
  "M275.4 116Q300.5 116 316.7 123.4Q332.8 130.8 345.4 140.7Q353 146.4 357 142.1Q361 137.7 362.5 121.3H371.3Q370.5 136.2 370.1 157.3Q369.8 178.4 369.8 213.4H361Q359.1 195.9 356.1 183.5Q353 171.2 347.7 161.7Q342.4 152.1 332.5 144.5Q323 135 310.4 130.5Q297.8 125.9 284.2 125.9Q263.6 125.9 249.2 136.7Q234.7 147.6 225.8 166.2Q216.8 184.9 212.6 208.3Q208.4 231.7 208.4 256.8Q208.4 282.3 212.8 305.6Q217.2 329 226.5 347.3Q235.8 365.6 250.7 376.2Q265.5 386.9 285.7 386.9Q298.2 386.9 311 382.1Q323.7 377.4 332.8 368.2Q347.7 356.8 353 339.9Q358.3 323 361 294.8H369.8Q369.8 330.9 370.1 353.2Q370.5 375.5 371.3 390.7H362.5Q361 374.3 357.4 370.1Q353.8 365.9 345.4 371.3Q331.3 381.2 315.5 388.6Q299.8 396 275 396Q234.7 396 204.5 379.6Q174.2 363.3 157.5 332.5Q140.7 301.7 140.7 258.3Q140.7 215.7 158 183.7Q175.3 151.8 205.6 133.9Q235.8 116 275.4 116Z";

const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/**
 * The Cardamix logo while something loads or a recipe is being read: an
 * ember travels round the copper ring and the C turns like a coin. Still (no
 * motion) for people who've asked their phone for reduced motion.
 */
/**
 * The animated logo for everyone, unless they turn it off in Settings →
 * Appearance (which brings back the plain spinner). To take it out for
 * everyone, set this to false: the plain spinner shows everywhere and the
 * Settings switch disappears.
 */
export const ANIMATED_LOGO = true;

const PLAIN_KEY = "recipe-builder.plainLoader"; // "1": this person turned it off
export function animatedLogoOn(): boolean {
  if (!ANIMATED_LOGO) return false;
  try {
    return localStorage.getItem(PLAIN_KEY) !== "1";
  } catch {
    return true;
  }
}
export function setAnimatedLogo(on: boolean): void {
  try {
    if (on) localStorage.removeItem(PLAIN_KEY);
    else localStorage.setItem(PLAIN_KEY, "1");
  } catch {
    /* this visit only */
  }
}

export default function LogoLoader({ size = 64, label }: { size?: number; label?: string }) {
  const id = useId().replace(/:/g, "");
  const still = reducedMotion();
  if (!animatedLogoOn()) {
    const px = Math.max(16, Math.round(size * 0.45));
    return <span className="spinner plain-loader" style={{ width: px, height: px }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
  }
  const cu = `cu${id}`;
  const ember = `ember${id}`;
  const glow = `glow${id}`;
  return (
    <svg
      className={still ? "logo-loader still" : "logo-loader"}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={cu} gradientUnits="userSpaceOnUse" x1="80" y1="80" x2="432" y2="432">
          <stop offset="0" stopColor="#f0c09a" />
          <stop offset=".45" stopColor="#cf8a5c" />
          <stop offset="1" stopColor="#9a4a26" />
        </linearGradient>
        {/* The ember's tail: nothing at the back, burning gold at the head. */}
        <linearGradient id={ember} gradientUnits="userSpaceOnUse" x1="256" y1="64" x2="436.4" y2="190.3">
          <stop offset="0" stopColor="#cf8a5c" stopOpacity="0" />
          <stop offset=".6" stopColor="#e9a46f" stopOpacity=".7" />
          <stop offset="1" stopColor="#ffe2b8" />
        </linearGradient>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <rect width="512" height="512" rx="112" fill="#1c1a17" />
      <circle cx="256" cy="256" r="192" fill="none" stroke={`url(#${cu})`} strokeWidth="7" />
      <circle cx="256" cy="256" r="176" fill="none" stroke={`url(#${cu})`} strokeWidth="2.5" />
      {/* An ember travelling round the ring. */}
      <g className="logo-loader-ember">
        <path d="M256 64A192 192 0 0 1 436.4 190.3" fill="none" stroke={`url(#${ember})`} strokeWidth="16" strokeLinecap="round" filter={`url(#${glow})`} />
        <path d="M256 64A192 192 0 0 1 436.4 190.3" fill="none" stroke={`url(#${ember})`} strokeWidth="7" strokeLinecap="round" />
        <circle cx="436.4" cy="190.3" r="16" fill="#ffb877" opacity=".7" filter={`url(#${glow})`} />
        <circle cx="436.4" cy="190.3" r="5" fill="#fff4e2" />
      </g>
      {/* The C turns like a coin. */}
      <g className="logo-loader-c">
        <path transform="translate(256 256) scale(.78) translate(-256 -256)" d={C_PATH} fill="#f3ece3" />
      </g>
    </svg>
  );
}

/** "Loading…" with the spinning logo — shown only if loading takes more than a moment (no flash). */
export function Loading({ text = "Loading…", delay = 250 }: { text?: string; delay?: number }) {
  const [show, setShow] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const t = window.setTimeout(() => setShow(true), delay);
    return () => window.clearTimeout(t);
  }, [delay]);
  if (!show) return null;
  return (
    <div className="loading-row" role="status">
      <LogoLoader size={56} />
      <span className="muted">{text}</span>
    </div>
  );
}
