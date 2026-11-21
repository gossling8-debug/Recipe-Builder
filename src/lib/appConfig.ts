import { rememberAnimatedLogo } from "../components/LogoLoader";
import { fb } from "./cloud";
import { callable } from "./subscription";

/**
 * App-wide settings the owner sets on the owner dashboard, for everyone
 * (Firestore config/app, readable by all, written only by the server).
 */
export interface AppConfig {
  animatedLogo: boolean;
  /** Where copyright notices go (shown on the copyright page). */
  copyrightEmail: string;
}

/** On start: fetch the owner's settings and keep them on this phone. */
export async function loadAppConfig(): Promise<AppConfig> {
  const { db, f } = await fb();
  const d = (await f.getDoc(f.doc(db, "config", "app"))).data() as Partial<AppConfig> | undefined;
  const cfg = { animatedLogo: d?.animatedLogo !== false, copyrightEmail: typeof d?.copyrightEmail === "string" ? d.copyrightEmail : "" };
  rememberAnimatedLogo(cfg.animatedLogo);
  return cfg;
}

/** Owner dashboard: turn the animated loading logo on or off for everyone. */
export async function setAnimatedLogoForEveryone(on: boolean): Promise<void> {
  await callable("ownerSetAppConfig", { animatedLogo: on });
  rememberAnimatedLogo(on);
}

/** Owner dashboard: the email copyright notices go to (public, on the copyright page). */
export async function setCopyrightEmail(email: string): Promise<void> {
  await callable("ownerSetAppConfig", { copyrightEmail: email });
}
