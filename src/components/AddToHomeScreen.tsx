import { useEffect, useState } from "react";
import { addSteps, canInstall, install, isStandalone, onInstallChange, thisBrowser, thisDevice, type Device } from "../lib/homeScreen";

/**
 * "Add Cardamix to your home screen": the steps for this phone (iPhone, iPad
 * or Android, and its browser), with a switch to the other kind of phone. On
 * Android, when the browser offers it, one button installs it. Hidden when
 * Cardamix is already open from the home screen.
 */
export default function AddToHomeScreen({ collapsed = false }: { collapsed?: boolean }) {
  const detected = thisDevice();
  const [device, setDevice] = useState<Device>(detected === "other" ? "iphone" : detected);
  const [open, setOpen] = useState(!collapsed);
  const [, refresh] = useState(0);
  useEffect(() => onInstallChange(() => refresh((n) => n + 1)), []);
  if (isStandalone()) return null;

  if (!open)
    return (
      <button className="link-btn small" onClick={() => setOpen(true)}>
        Add Cardamix to your home screen
      </button>
    );

  // The browser in use only matters on the device it's running on.
  const browser = device === detected ? thisBrowser() : device === "android" ? "chrome" : "safari";
  const steps = addSteps(device, browser);
  const apple = device === "iphone" || device === "ipad";
  return (
    <div className="add-home">
      <p className="small">
        <strong>Add Cardamix to your home screen</strong> to open it like an app.
      </p>
      {device === "android" && device === detected && canInstall() ? (
        <button className="btn primary" onClick={() => void install()}>
          Add to home screen
        </button>
      ) : (
        <ol className="small add-home-steps">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      <p className="muted small">Then open Cardamix from the new icon and sign in once with your email and password.</p>
      <div className="add-home-switch small" role="group" aria-label="Show the steps for">
        {(
          [
            ["iphone", "iPhone"],
            ["ipad", "iPad"],
            ["android", "Android"],
          ] as const
        ).map(([d, label]) => (
          <button key={d} className={device === d ? "chip active" : "chip"} aria-pressed={device === d} onClick={() => setDevice(d)}>
            {label}
          </button>
        ))}
      </div>
      {!apple && device !== detected && <p className="muted small">On other Android browsers, look for “Add to Home screen” or “Install” in the menu.</p>}
    </div>
  );
}
