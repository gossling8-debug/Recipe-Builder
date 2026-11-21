/**
 * The printed cookbook (Lulu, 8.5 × 11 in full-color hardcover): the
 * interior and the wrap-around cover as print-ready PDFs, built here on the
 * server from the recipes saved in the account — the same file for the
 * on-screen preview and for the printer.
 *
 * Fonts are embedded (Lora and Source Sans 3, SIL Open Font License, in
 * functions/fonts) — printers reject PDFs whose fonts aren't.
 */
import { readFileSync } from "node:fs";
import { jsPDF } from "jspdf";

const IN = 72; // points per inch
export const TRIM = { w: 8.5 * IN, h: 11 * IN };
export const BLEED = 0.125 * IN;
/** Interior pages: trim plus bleed all round. */
export const PAGE = { w: TRIM.w + 2 * BLEED, h: TRIM.h + 2 * BLEED };
/** Lulu's minimum for a hardcover, and the most this product allows. */
export const MIN_PAGES = 24;
export const MAX_PAGES = 100;

const FONT_DIR = new URL("../fonts/", import.meta.url);
let fontData = null;
function fonts() {
  fontData ??= Object.fromEntries(
    [
      ["Lora", "normal", "Lora_400Regular.ttf"],
      ["Lora", "bold", "Lora_700Bold.ttf"],
      ["Lora", "italic", "Lora_400Regular_Italic.ttf"],
      ["Sans", "normal", "SourceSans3_400Regular.ttf"],
      ["Sans", "bold", "SourceSans3_600SemiBold.ttf"],
    ].map(([family, style, file]) => [`${family}-${style}`, { family, style, file, data: readFileSync(new URL(file, FONT_DIR)).toString("base64") }]),
  );
  return fontData;
}
function newDoc(format) {
  const doc = new jsPDF({ unit: "pt", format, orientation: format[0] > format[1] ? "landscape" : "portrait", compress: true, putOnlyUsedFonts: true });
  for (const f of Object.values(fonts())) {
    doc.addFileToVFS(f.file, f.data);
    doc.addFont(f.file, f.family, f.style);
  }
  return doc;
}

const INK = [28, 26, 23];
const MUTED = [110, 102, 94];
const ACCENT = [154, 74, 38];

/** "1 ½ cups" — amounts as the recipe gives them. */
const amountOf = (i) => [i.quantity, i.unit].filter(Boolean).join(" ");
const ingredientLine = (i) => [amountOf(i), i.name, i.preparation ? `, ${i.preparation}` : ""].filter(Boolean).join(" ").replace(" ,", ",");
const stepText = (s) => (s.segments ?? []).map((g) => (g.ingredient_index !== null && g.amount ? `${g.text} (${g.amount})` : g.text)).join("");
const clean = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

// Margins measured from the trimmed edge (the bleed is outside them).
const M = { top: 0.8 * IN, bottom: 0.85 * IN, inner: 0.9 * IN, outer: 0.7 * IN };

/**
 * Lays out and draws the interior. `book` = { title, subtitle, dedication, includePhotos },
 * `recipes` = [{ title, servings, time, ingredients, steps, notes, photo (data URL or null) }].
 * Returns { pdf (Uint8Array), pages, starts (first page of each recipe) }.
 */
export function buildInterior(book, recipes) {
  const doc = newDoc([PAGE.w, PAGE.h]);
  let page = 1; // the current page number (1 = the first right-hand page)
  const left = () => (page % 2 === 0 ? M.outer : M.inner) + BLEED;
  const width = () => TRIM.w - M.inner - M.outer;
  const top = BLEED + M.top;
  const bottom = BLEED + TRIM.h - M.bottom;
  let y = top;

  const font = (family, style, size, color = INK) => {
    doc.setFont(family, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const footer = () => {
    if (page < 5) return; // no number on the opening pages
    font("Sans", "normal", 9, MUTED);
    doc.text(String(page), page % 2 === 0 ? BLEED + M.outer : BLEED + TRIM.w - M.outer, BLEED + TRIM.h - 0.45 * IN, { align: page % 2 === 0 ? "left" : "right" });
  };
  const nextPage = () => {
    footer();
    doc.addPage([PAGE.w, PAGE.h]);
    page++;
    y = top;
  };
  /** Wrapped text at the left margin, flowing onto new pages; returns the lines drawn. */
  const para = (text, { family = "Sans", style = "normal", size = 11, color = INK, indent = 0, lead = 1.38, after = 6, hang = "" } = {}) => {
    font(family, style, size, color);
    const lines = doc.splitTextToSize(clean(text), width() - indent - (hang ? 18 : 0));
    // A step or ingredient isn't split across pages (unless it's longer than a page).
    const tall = lines.length * size * lead;
    if (hang && y + tall > bottom && tall < bottom - top) nextPage(), font(family, style, size, color);
    lines.forEach((line, i) => {
      if (y + size > bottom) nextPage(), font(family, style, size, color);
      if (hang && i === 0) {
        font("Sans", "bold", size, ACCENT);
        doc.text(hang, left() + indent, y + size);
        font(family, style, size, color);
      }
      doc.text(line, left() + indent + (hang ? 18 : 0), y + size);
      y += size * lead;
    });
    y += after;
  };
  const heading = (text, size = 12) => {
    if (y + size * 4 > bottom) nextPage();
    font("Sans", "bold", size, ACCENT);
    doc.text(text.toUpperCase(), left(), y + size, { charSpace: 1.2 });
    y += size * 1.9;
  };

  // 1: title page.
  font("Lora", "bold", 34);
  const titleLines = doc.splitTextToSize(clean(book.title) || "Our Family Recipes", width());
  let ty = BLEED + TRIM.h * 0.36;
  for (const l of titleLines) doc.text(l, BLEED + TRIM.w / 2, ty, { align: "center" }), (ty += 42);
  if (book.subtitle) {
    font("Lora", "italic", 15, MUTED);
    for (const l of doc.splitTextToSize(clean(book.subtitle), width())) doc.text(l, BLEED + TRIM.w / 2, ty + 8, { align: "center" }), (ty += 20);
  }
  // 2: the back of the title page — blank. 3: dedication.
  nextPage();
  nextPage();
  if (book.dedication) {
    font("Lora", "italic", 15, INK);
    let dy = BLEED + TRIM.h * 0.38;
    for (const l of doc.splitTextToSize(clean(book.dedication), width() * 0.8)) doc.text(l, BLEED + TRIM.w / 2, dy, { align: "center" }), (dy += 22);
  }
  // 4: blank. 5: contents (page numbers filled in once the recipes are laid out).
  nextPage();
  nextPage();
  const tocPages = Math.max(1, Math.ceil(recipes.length / 30));
  const tocAt = [];
  for (let i = 0; i < tocPages; i++) {
    tocAt.push({ page, y: top });
    if (i < tocPages - 1) nextPage();
  }

  // The recipes, each on a new page.
  const starts = [];
  for (const r of recipes) {
    nextPage();
    starts.push(page);
    font("Lora", "bold", 26);
    for (const l of doc.splitTextToSize(clean(r.title), width())) doc.text(l, left(), y + 26), (y += 32);
    const meta = [r.servings, r.time].map(clean).filter(Boolean).join("  ·  ");
    if (meta) {
      font("Sans", "normal", 10.5, MUTED);
      doc.text(meta, left(), y + 12);
      y += 20;
    }
    y += 8;
    if (book.includePhotos && r.photo) {
      try {
        const p = doc.getImageProperties(r.photo);
        const maxW = Math.min(width(), 5 * IN);
        const maxH = 3.6 * IN;
        const s = Math.min(maxW / p.width, maxH / p.height);
        const w = p.width * s, h = p.height * s;
        if (y + h > bottom) nextPage();
        doc.addImage(r.photo, p.fileType ?? "JPEG", left(), y, w, h);
        y += h + 16;
      } catch {
        /* a photo that can't be read is left out */
      }
    }
    if (r.ingredients?.length) {
      heading("Ingredients", 10.5);
      let section = null;
      for (const ing of r.ingredients) {
        if (ing.section && ing.section !== section) {
          section = ing.section;
          para(section, { style: "bold", size: 10.5, after: 2 });
        }
        para(ingredientLine(ing), { size: 11, after: 1.5, hang: "•" });
      }
      y += 10;
    }
    if (r.steps?.length) {
      heading("Steps", 10.5);
      r.steps.forEach((s, i) => para(stepText(s), { size: 11, after: 7, hang: `${i + 1}` }));
    }
    if (r.notes) {
      y += 6;
      heading("Notes", 10.5);
      para(r.notes, { family: "Lora", style: "italic", size: 11 });
    }
  }

  // Notes pages: at least MIN_PAGES, and an even number of pages.
  const ruled = () => {
    font("Lora", "bold", 18);
    doc.text("Notes", left(), top + 18);
    doc.setDrawColor(220, 214, 206);
    doc.setLineWidth(0.6);
    for (let ly = top + 54; ly < bottom; ly += 0.36 * IN) doc.line(left(), ly, left() + width(), ly);
  };
  if (page < MIN_PAGES || page % 2 === 1) {
    nextPage();
    ruled();
    while (page < MIN_PAGES || page % 2 === 1) nextPage(), ruled();
  }
  footer();

  // Back to the contents now that the page numbers are known.
  recipes.forEach((r, i) => {
    const at = tocAt[Math.floor(i / 30)];
    doc.setPage(at.page);
    const x = (at.page % 2 === 0 ? M.outer : M.inner) + BLEED;
    if (i % 30 === 0) {
      font("Lora", "bold", 22);
      doc.text(i === 0 ? "Recipes" : "Recipes (continued)", x, top + 22);
    }
    const ly = top + 64 + (i % 30) * 0.27 * IN;
    font("Sans", "normal", 11.5);
    const t = doc.splitTextToSize(clean(r.title), width() - 40)[0];
    doc.text(t, x, ly);
    doc.setTextColor(...MUTED);
    doc.text(String(starts[i]), x + width(), ly, { align: "right" });
  });

  return { pdf: new Uint8Array(doc.output("arraybuffer")), pages: page, starts };
}

/**
 * The cover: one spread (back, spine, front) at the size Lulu gives for the
 * page count (`size` = { width, height } in points, wrap and bleed included).
 * `book.cover` = data URL of the front photo, or null.
 */
export function buildCover(book, size) {
  const doc = newDoc([size.width, size.height]);
  const wrap = (size.height - TRIM.h) / 2; // the part folded round the boards, with bleed
  const spine = Math.max(0, size.width - 2 * (TRIM.w + wrap));
  const half = (size.width - spine) / 2;
  // Background: warm dark, copper rules.
  doc.setFillColor(28, 26, 23);
  doc.rect(0, 0, size.width, size.height, "F");
  const front = { x: half + spine, w: half };
  const safe = wrap + 0.5 * IN;
  // Front: photo, title, subtitle.
  let y = safe + 0.4 * IN;
  if (book.cover) {
    try {
      const p = doc.getImageProperties(book.cover);
      const maxW = front.w - 2 * safe;
      const maxH = size.height * 0.45;
      const s = Math.min(maxW / p.width, maxH / p.height);
      const w = p.width * s, h = p.height * s;
      doc.addImage(book.cover, p.fileType ?? "JPEG", front.x + (front.w - w) / 2, y, w, h);
      y += h + 0.45 * IN;
    } catch {
      y += 1.2 * IN;
    }
  } else y += 2.2 * IN;
  doc.setDrawColor(207, 138, 92);
  doc.setLineWidth(1.2);
  doc.line(front.x + front.w / 2 - 0.6 * IN, y, front.x + front.w / 2 + 0.6 * IN, y);
  y += 0.55 * IN;
  doc.setFont("Lora", "bold");
  doc.setFontSize(32);
  doc.setTextColor(243, 236, 227);
  for (const l of doc.splitTextToSize(clean(book.title) || "Our Family Recipes", front.w - 2 * safe)) doc.text(l, front.x + front.w / 2, y, { align: "center" }), (y += 40);
  if (book.subtitle) {
    doc.setFont("Lora", "italic");
    doc.setFontSize(15);
    doc.setTextColor(207, 138, 92);
    for (const l of doc.splitTextToSize(clean(book.subtitle), front.w - 2 * safe)) doc.text(l, front.x + front.w / 2, y + 6, { align: "center" }), (y += 20);
  }
  // Spine: the title, reading top to bottom, when there's room.
  if (spine >= 0.35 * IN) {
    doc.setFont("Lora", "bold");
    doc.setFontSize(Math.min(14, spine * 0.45));
    doc.setTextColor(243, 236, 227);
    doc.text(clean(book.title).slice(0, 60) || "Our Family Recipes", half + spine / 2 + Math.min(14, spine * 0.45) * 0.35, safe + 0.2 * IN, { angle: -90 });
  }
  // Back: a short line.
  doc.setFont("Sans", "normal");
  doc.setFontSize(10);
  doc.setTextColor(170, 160, 150);
  doc.text("Recipes collected with Cardamix", half / 2, size.height - safe - 0.2 * IN, { align: "center" });
  return new Uint8Array(doc.output("arraybuffer"));
}

/**
 * Spine width for a casewrap hardcover by page count — only used for the
 * preview; the real cover uses the size Lulu's cover-dimensions endpoint
 * gives (its spine is the width minus the two panels).
 */
export function spineWidth(pages) {
  const steps = [[84, 0.25], [140, 0.5], [168, 0.625], [194, 0.688], [222, 0.75], [250, 0.813], [278, 0.875], [306, 0.938]];
  return (steps.find(([max]) => pages <= max)?.[1] ?? 1) * IN;
}
/** A cover size for the preview (Lulu gives the real one). */
export const previewCoverSize = (pages) => ({ width: 2 * (TRIM.w + 0.75 * IN) + spineWidth(pages), height: TRIM.h + 2 * 0.75 * IN });
