import { useState } from "react";
import Header from "./Header";
import { href } from "../lib/route";
import { searchTips } from "../lib/tips";

/** Helpful kitchen tips: safe temperatures, steak doneness, grilling, food safety and more. */
export default function TipsPage() {
  const [q, setQ] = useState("");
  const sections = searchTips(q);
  const searching = q.trim().length > 0;

  return (
    <>
      <Header title="Tips" back={href({ name: "library" })} />
      <main className="page tips">
        <input className="search" type="search" placeholder="Search tips, e.g. chicken, steak, eggs" value={q} onChange={(e) => setQ(e.target.value)} />
        {sections.length === 0 && <p className="muted">No tips match “{q.trim()}”.</p>}
        {sections.map((s, i) => (
          // Searching opens every match; otherwise the first two sections start open.
          <details key={s.id + (searching ? "-s" : "")} className="tip-section" open={searching || i < 2}>
            <summary>{s.title}</summary>
            {s.intro && <p className="muted small">{s.intro}</p>}
            {s.rows && (
              <table className="tip-table">
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.what}>
                      <th scope="row">{r.what}</th>
                      <td>
                        <strong>{r.value}</strong>
                        {r.detail && <span className="tip-detail">{r.detail}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {s.bullets && (
              <ul className="tip-bullets">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {s.note && <p className="small tip-note">{s.note}</p>}
            {s.source && <p className="muted small">Source: {s.source}.</p>}
          </details>
        ))}
        <p className="muted small">General guidance — always follow your recipe and your thermometer.</p>
      </main>
    </>
  );
}
