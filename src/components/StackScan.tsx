import { useEffect, useRef, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import DocumentScanner, { type ScannedPage } from "./DocumentScanner";
import { compressPhoto, cropToCard, prepareCrop } from "../lib/image";
import { href } from "../lib/route";
import { hasPlus } from "../lib/features";
import { ownKey } from "../lib/settings";
import { FREE_LIMITS } from "../lib/subscription";
import {
  addBack,
  addCard,
  clearFinished,
  removeCard,
  resumeStack,
  retryCard,
  stackCards,
  stackPaused,
  type StackCard,
} from "../lib/stackScan";

/** Each photo → one card: straightened when the card is found, otherwise as it is. */
async function cardPhoto(file: Blob): Promise<string> {
  try {
    const src = await prepareCrop(file);
    return src.found ? await cropToCard(src, src.found) : await compressPhoto(file);
  } catch {
    return compressPhoto(file);
  }
}

/**
 * "Scan a stack": photograph recipe cards one after another; each is read in the
 * background and added to your recipes. You can leave this screen meanwhile.
 */
export default function StackScan() {
  const [cards, setCards] = useState(stackCards);
  const [paused, setPaused] = useState(stackPaused);
  const [scanning, setScanning] = useState<null | "cards" | { back: string }>(null);
  const [preparing, setPreparing] = useState(0);
  const [noCamera, setNoCamera] = useState("");
  const choose = useRef<HTMLInputElement>(null);
  const backPick = useRef<{ input: HTMLInputElement | null; id: string }>({ input: null, id: "" });

  useEffect(() => {
    const on = () => (setCards(stackCards()), setPaused(stackPaused()));
    window.addEventListener("stack-changed", on);
    void resumeStack();
    return () => window.removeEventListener("stack-changed", on);
  }, []);
  // Each "waiting" card's countdown to reading is shown, so refresh once a second while any waits.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!cards.some((c) => c.status === "waiting" && c.readyAt > Date.now())) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [cards]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setPreparing((n) => n + list.length);
    for (const f of list) {
      try {
        await addCard(await cardPhoto(f));
      } finally {
        setPreparing((n) => n - 1);
      }
    }
  }
  async function scanned(pages: ScannedPage[]) {
    const target = scanning;
    setScanning(null);
    if (target && typeof target === "object") {
      if (pages[0]) await addBack(target.back, pages[0].photo);
      return;
    }
    for (const p of pages) await addCard(p.photo);
  }

  const done = cards.filter((c) => c.status === "done").length;
  const failed = cards.filter((c) => c.status === "failed").length;
  const left = cards.filter((c) => c.status === "waiting" || c.status === "reading").length;
  const free = !ownKey() && !hasPlus();

  if (scanning)
    return (
      <DocumentScanner
        multiPage={scanning === "cards"}
        cleanByDefault
        onDone={(pages) => void scanned(pages)}
        onCancel={() => setScanning(null)}
        onNoCamera={(why) => (setScanning(null), setNoCamera(why))}
      />
    );

  return (
    <>
      <Header title="Scan a stack" back={href({ name: "scan" })} />
      <main className="page stack-scan">
        <p>
          Photograph your recipe cards one after another — each photo is one card. Cardamix reads them in the background and adds
          each to your recipes. You can keep going, or leave this screen.
        </p>
        {free && (
          <p className="muted small">
            The free plan reads {FREE_LIMITS.scan} recipes a month; cards past that wait here until you{" "}
            <a href={href({ name: "plus" })}>upgrade</a> or the month starts over.
          </p>
        )}
        <div className="button-row">
          <button className="btn primary" onClick={() => (setNoCamera(""), setScanning("cards"))}>
            <Icon name="camera" /> Scan cards
          </button>
          <button className="btn" onClick={() => choose.current?.click()}>
            <Icon name="image" /> Choose photos
          </button>
        </div>
        <input ref={choose} type="file" accept="image/*" multiple hidden onChange={(e) => (void addFiles(e.target.files), (e.target.value = ""))} />
        <input
          ref={(el) => void (backPick.current.input = el)}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) await addBack(backPick.current.id, await cardPhoto(f));
          }}
        />
        {noCamera && (
          <div className="callout small">
            {noCamera} Use <strong>Choose photos</strong> instead.
          </div>
        )}
        {preparing > 0 && <p className="muted small">Getting {preparing === 1 ? "the photo" : `${preparing} photos`} ready…</p>}

        {paused && (
          <div className="callout warn small" role="status">
            <strong>Reading has stopped:</strong> {paused}
            <div className="button-row">
              <button className="btn" onClick={() => void resumeStack()}>
                Try again
              </button>
              {/upgrade/i.test(paused) && (
                <a className="btn" href={href({ name: "plus" })}>
                  See plans
                </a>
              )}
            </div>
          </div>
        )}

        {cards.length > 0 && (
          <>
            <p className="stack-summary" role="status">
              <strong>
                {done} of {cards.length} added
              </strong>
              {left > 0 && ` · ${left} to go`}
              {failed > 0 && ` · ${failed} couldn't be read`}
            </p>
            <ul className="stack-list">
              {[...cards].reverse().map((c) => (
                <Row
                  key={c.id}
                  card={c}
                  onScanBack={() => setScanning({ back: c.id })}
                  onChooseBack={() => {
                    backPick.current.id = c.id;
                    backPick.current.input?.click();
                  }}
                />
              ))}
            </ul>
            {done > 0 && (
              <button className="link-btn small" onClick={() => void clearFinished()}>
                Clear the finished ones from this list
              </button>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Row({ card: c, onScanBack, onChooseBack }: { card: StackCard; onScanBack: () => void; onChooseBack: () => void }) {
  const wait = Math.ceil((c.readyAt - Date.now()) / 1000);
  return (
    <li className={`stack-card ${c.status}`}>
      <img src={c.photos[0]} alt="" />
      <div>
        {c.status === "done" ? (
          <>
            <a href={href({ name: "recipe", id: c.recipeId! })}>
              <strong>{c.title}</strong>
            </a>
            <div className="muted small">
              <Icon name="check" size={14} /> Added
              {c.twin && ` · looks like “${c.twin}”, which you already have`}
            </div>
          </>
        ) : c.status === "failed" ? (
          <>
            <strong>Couldn't read this card</strong>
            <div className="muted small">{c.error}</div>
            <div className="stack-actions">
              <button className="link-btn small" onClick={() => void retryCard(c.id)}>
                Try again
              </button>
              <button className="link-btn small" onClick={() => void removeCard(c.id)}>
                Remove
              </button>
            </div>
          </>
        ) : c.status === "reading" ? (
          <strong>Reading…</strong>
        ) : (
          <>
            <strong>{wait > 0 ? `Reading in ${wait}s` : "Waiting its turn"}</strong>
            <div className="muted small">{c.photos.length === 2 ? "Front and back" : "Recipe continues on the back?"}</div>
            {c.photos.length < 2 && (
              <div className="stack-actions">
                <button className="link-btn small" onClick={onScanBack}>
                  Scan the back
                </button>
                <button className="link-btn small" onClick={onChooseBack}>
                  Choose a photo of the back
                </button>
                <button className="link-btn small" onClick={() => void removeCard(c.id)}>
                  Remove
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
