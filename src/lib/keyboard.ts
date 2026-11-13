/**
 * Keep pop-up sheets usable with the on-screen keyboard (iPhone Safari).
 *
 * Safari doesn't shrink the page when the keyboard opens, so a sheet pinned to
 * the bottom of the screen ends up partly under the keyboard, and Safari scrolls
 * the page so the box you tapped jumps out of view. We track the part of the
 * screen you can actually see (visualViewport) in CSS variables the sheets use,
 * and scroll the tapped box into the middle of its sheet.
 */
export function keepSheetsAboveKeyboard(): void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (vv) {
    const update = () => {
      root.style.setProperty("--vv-height", `${vv.height}px`);
      root.style.setProperty("--vv-top", `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
  }
  document.addEventListener("focusin", (e) => {
    const field = e.target as HTMLElement | null;
    if (!field || !field.matches?.("input, textarea, select")) return;
    const sheet = field.closest(".sheet") as HTMLElement | null;
    if (!sheet) return;
    // After the keyboard has opened and the sheet has resized.
    const center = () => {
      const s = sheet.getBoundingClientRect();
      const f = field.getBoundingClientRect();
      sheet.scrollTop += f.top + f.height / 2 - (s.top + s.height / 2);
    };
    setTimeout(center, 50);
    setTimeout(center, 350);
  });
}
