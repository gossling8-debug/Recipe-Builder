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
 * The Cardamix logo while something loads or Claude is reading: the C spins,
 * filled with a flickering flame. Still (no motion) for people who've asked
 * their phone for reduced motion.
 */
export default function LogoLoader({ size = 64, label }: { size?: number; label?: string }) {
  const id = useId().replace(/:/g, "");
  const still = reducedMotion();
  const fire = `fire${id}`;
  const cu = `cu${id}`;
  const blur = `blur${id}`;
  return (
    <svg
      className="logo-loader"
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
        {/* Flame: a hot yellow core rising into orange and red tips, the bands moving upward. */}
        <linearGradient id={fire} gradientUnits="userSpaceOnUse" x1="0" y1="420" x2="0" y2="100" spreadMethod="reflect">
          <stop offset="0" stopColor="#fff3b0">
            {!still && <animate attributeName="stop-color" values="#fff3b0;#ffe27a;#fff3b0" dur="0.9s" repeatCount="indefinite" />}
          </stop>
          <stop offset=".35" stopColor="#ffb22e" />
          <stop offset=".7" stopColor="#ff6a13" />
          <stop offset="1" stopColor="#d2321a" />
          {!still && <animate attributeName="y1" values="420;360;420" dur="1.1s" repeatCount="indefinite" />}
          {!still && <animate attributeName="y2" values="100;40;100" dur="1.1s" repeatCount="indefinite" />}
        </linearGradient>
        <filter id={blur} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <rect width="512" height="512" rx="112" fill="#1c1a17" />
      <circle cx="256" cy="256" r="192" fill="none" stroke={`url(#${cu})`} strokeWidth="7" />
      <circle cx="256" cy="256" r="176" fill="none" stroke={`url(#${cu})`} strokeWidth="2.5" />
      <g className="logo-loader-c">
        <g transform="translate(256 256) scale(.78) translate(-256 -256)">
          {/* The glow behind the flame. */}
          <path className="logo-loader-glow" d={C_PATH} fill="#ff7a1a" filter={`url(#${blur})`} />
          <path d={C_PATH} fill={`url(#${fire})`} />
        </g>
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
      <LogoLoader size={36} />
      <span className="muted">{text}</span>
    </div>
  );
}
