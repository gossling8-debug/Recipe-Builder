import { useState } from "react";
import { exportBackup } from "../lib/backup";
import { backupDue, lastBackup, snoozeBackup, snoozedUntil } from "../lib/backupReminder";
import type { CloudState } from "../lib/cloud";
import { href } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";

/** Home screen: "Your recipes are only on this phone" — about once a month, until cloud backup is on. */
export default function BackupNudge({ recipes, cloud }: { recipes: SavedRecipe[]; cloud: CloudState }) {
  const [, refresh] = useState(0);
  const [done, setDone] = useState("");
  // Wait until we know whether someone is signed in, so signed-in cooks never see a flash of this.
  const cloudKnown = cloud.status === "off" || cloud.authKnown;
  if (done) return <div className="callout small">{done}</div>;
  if (!cloudKnown) return null;
  const due = backupDue({
    backedUpInCloud: cloud.status !== "off" && cloud.status !== "signed-out",
    recipeCount: recipes.length,
    oldestRecipeAt: recipes.length ? Math.min(...recipes.map((r) => r.createdAt)) : null,
    lastBackup: lastBackup(),
    snoozedUntil: snoozedUntil(),
    now: Date.now(),
  });
  if (!due) return null;
  const n = recipes.length;
  return (
    <div className="callout backup-nudge">
      <strong>
        Your {n} {n === 1 ? "recipe is" : "recipes are"} only on this phone.
      </strong>{" "}
      If the phone is lost or the browser's data is cleared, they're gone.
      <div className="button-row">
        {cloud.status !== "off" && (
          <a className="btn primary" href={href({ name: "settings" })}>
            Turn on cloud backup
          </a>
        )}
        <button
          className="btn"
          onClick={() =>
            exportBackup().then(
              () => setDone("Backup file saved. Keep it somewhere safe, like Files, iCloud Drive or Google Drive."),
              (e) => setDone(`Backup failed: ${e instanceof Error ? e.message : e}`),
            )
          }
        >
          Export a backup file
        </button>
      </div>
      <button
        className="link-btn small"
        onClick={() => {
          snoozeBackup();
          refresh((x) => x + 1);
        }}
      >
        Not now
      </button>
    </div>
  );
}
