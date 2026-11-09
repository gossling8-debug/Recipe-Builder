/** Thin line icons (24×24, 1.6 stroke) so the app reads as calm and consistent. */
const PATHS = {
  back: "M15 18l-6-6 6-6",
  settings: "M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4",
  camera:
    "M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z M12 16a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
  image: "M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z M4 15l4.5-4.5L13 15 M12 14l2.5-2.5L20 17 M15.5 9.5h.01",
  edit: "M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z M14.5 7.5l2 2",
  trash: "M4 7h16 M9 7V5h6v2 M6.5 7l1 12.5h9l1-12.5 M10 11v5 M14 11v5",
  download: "M12 4v11 M7.5 10.5L12 15l4.5-4.5 M5 19.5h14",
  upload: "M12 15V4 M7.5 8.5L12 4l4.5 4.5 M5 19.5h14",
  reset: "M4 12a8 8 0 1 0 2.4-5.7L4 8.5 M4 4v4.5h4.5",
  plus: "M12 5v14 M5 12h14",
  warning: "M10.3 4.2a2 2 0 0 1 3.4 0l8.1 14a2 2 0 0 1-1.7 3H3.9a2 2 0 0 1-1.7-3z M12 9.5v4.5 M12 17.3h.01",
  speaker: "M4 9.5h3.5L12 6v12l-4.5-3.5H4z M15.5 9a4 4 0 0 1 0 6 M18 6.5a7.5 7.5 0 0 1 0 11",
  mic: "M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z M6.5 11.5a5.5 5.5 0 0 0 11 0 M12 17v3.5",
  pause: "M9 6v12 M15 6v12",
  play: "M8 5.5v13l10-6.5z",
  jar: "M8 3.5h8 M8.5 3.5V6 M15.5 3.5V6 M7 6h10a1.5 1.5 0 0 1 1.5 1.5v11A2.5 2.5 0 0 1 16 21H8a2.5 2.5 0 0 1-2.5-2.5v-11A1.5 1.5 0 0 1 7 6z M5.5 11h13",
  book: "M5 4.5h11.5A1.5 1.5 0 0 1 18 6v14H6.5A1.5 1.5 0 0 1 5 18.5z M5 18.5A1.5 1.5 0 0 1 6.5 17H18 M9 8.5h5",
  plate: "M6.5 3v5.5a2 2 0 0 0 4 0V3 M8.5 3v18 M17.5 3c-2 1.6-2.7 4.2-2.7 8.3h2.7 M17.5 3v18",
  moon: "M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z",
  wallet: "M4 7.5A1.5 1.5 0 0 1 5.5 6h12A1.5 1.5 0 0 1 19 7.5V9h.5a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5H19v1.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 16.5z M15.5 12h.01",
  calendar: "M5.5 6h13A1.5 1.5 0 0 1 20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6z M4 10.5h16 M8.5 3.5v4 M15.5 3.5v4",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 9v4l2.5 2 M10 2.5h4",
  close: "M6 6l12 12 M18 6L6 18",
  up: "M12 19V5 M6 11l6-6 6 6",
  down: "M12 5v14 M6 13l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4",
  share: "M12 3.5v11 M8 7.5l4-4 4 4 M6 11H5.5A1.5 1.5 0 0 0 4 12.5v6A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H18",
  star: "M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.6-5 2.6 1-5.6-4.1-3.9 5.6-.8z",
  bag: "M5.5 8h13l-1 11.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5z M9 10V6.5a3 3 0 0 1 6 0V10",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 22, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
