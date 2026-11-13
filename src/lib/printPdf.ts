/**
 * The printable recipe as a real PDF file. Phones often ignore the browser's
 * own print command (an app added to the home screen, DuckDuckGo, in-app
 * browsers), so the Print button makes the PDF itself and hands it to the
 * share sheet, where Print, Save to Files, Messages and Mail all work.
 */
export type PdfBlock =
  | { kind: "title"; text: string }
  | { kind: "meta"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "step"; n: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "img"; src: string };

// The PDF's built-in fonts only know Western characters: spell the rest out.
const FRACTIONS: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};
const KEEP = new Set(["–", "—", "‘", "’", "“", "”", "•", "…", "€", "™"]);
export function pdfSafe(text: string): string {
  return text
    .replace(/(\d)\s?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_m, d: string, f: string) => `${d} ${FRACTIONS[f]}`)
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (f) => FRACTIONS[f])
    .replace(/[×✕]/g, "x")
    .replace(/≈\s?/g, "about ")
    .replace(/[★]/g, "*")
    .replace(/[^\u0000-ÿ]/g, (c) => (KEEP.has(c) ? c : c.normalize("NFKD").replace(/[^\u0000-ÿ]/g, "")));
}

/** Builds the PDF (letter size) and returns it as a file named after the recipe. */
export async function recipePdf(blocks: PdfBlock[], title: string, large: boolean): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 54; // ¾-inch margins
  const width = W - 2 * M;
  const body = large ? 14 : 11.5;
  const lead = 1.4;
  let y = M;
  const room = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };
  const write = (text: string, size: number, style: "normal" | "bold" | "italic", indent = 0, prefix = "") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(pdfSafe(text), width - indent) as string[];
    lines.forEach((ln, i) => {
      room(size * lead);
      if (i === 0 && prefix === "•") doc.circle(M + indent - size * 0.7, y + size * 0.68, size * 0.16, "F");
      else if (i === 0 && prefix) doc.text(prefix, M + indent - size * 1.4, y + size);
      doc.text(ln, M + indent, y + size);
      y += size * lead;
    });
  };

  for (const b of blocks) {
    if (b.kind === "img") {
      try {
        const props = doc.getImageProperties(b.src);
        const w = width;
        const h = Math.min((props.height / props.width) * w, 240);
        const iw = (props.width / props.height) * h;
        room(h + 12);
        doc.addImage(b.src, "JPEG", M + (width - iw) / 2, y, iw, h);
        y += h + 14;
      } catch {
        /* a photo that can't be read is left out */
      }
    } else if (b.kind === "title") {
      write(b.text, large ? 26 : 22, "bold");
      y += 2;
    } else if (b.kind === "meta") {
      doc.setTextColor(100);
      write(b.text, body, "normal");
      doc.setTextColor(0);
    } else if (b.kind === "h2") {
      y += body * 0.9;
      room(body * 3);
      write(b.text.toUpperCase(), body * 0.9, "bold");
      doc.setDrawColor(160);
      doc.line(M, y + 1, W - M, y + 1);
      y += body * 0.5;
    } else if (b.kind === "h3") {
      y += 4;
      write(b.text, body, "bold");
    } else if (b.kind === "bullet") {
      write(b.text, body, "normal", 16, "•");
    } else if (b.kind === "step") {
      write(b.text, body, "normal", 22, `${b.n}.`);
      y += body * 0.35;
    } else {
      write(b.text, body, "normal");
    }
  }
  const name = (title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Recipe") + ".pdf";
  return new File([doc.output("blob")], name, { type: "application/pdf" });
}

/**
 * Hands the PDF to the share sheet (Print, Save to Files…). Where files can't be
 * shared (most computers), the browser's own print dialog opens instead.
 * Returns "shared", "printed" or "cancelled".
 */
export async function printOrShare(file: File | null): Promise<"shared" | "printed" | "cancelled"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (file && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name.replace(/\.pdf$/, "") });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Some browsers refuse files after all: fall through to printing.
    }
  }
  window.print();
  return "printed";
}
