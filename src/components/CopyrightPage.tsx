import { useEffect, useState } from "react";
import Header from "./Header";
import { href } from "../lib/route";
import { loadAppConfig } from "../lib/appConfig";

/**
 * How Cardamix handles copyright, and how a rights holder sends a notice
 * (the DMCA's notice-and-takedown process). Readable without an account.
 */
export default function CopyrightPage() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    loadAppConfig().then((c) => setEmail(c.copyrightEmail), () => setEmail(""));
  }, []);
  return (
    <>
      <Header title="Copyright" back={href({ name: "settings" })} />
      <main className="page privacy">
        <h1 className="page-title">Copyright</h1>

        <h3>Recipes and copyright</h3>
        <p>
          A list of ingredients is a set of facts. A cookbook's written instructions, stories, photos and layout can belong to its author or
          publisher. Cardamix is built with that in mind:
        </p>
        <ul>
          <li>Recipes you add are private to your account. Saving a recipe from a cookbook you own, for your own cooking, stays with you.</li>
          <li>
            When Cardamix reads a recipe it notes where it came from — a handwritten card, or a published cookbook or magazine page and its
            title.
          </li>
          <li>
            Recipes from websites are never reposted in The Mix: only the title and a link to the original site. Recipes from published
            cookbooks can only go in The Mix rewritten in fresh wording, with credit to the book.
          </li>
          <li>Ordering a printed cookbook asks you to confirm you have the right to print every recipe in it.</li>
        </ul>

        <h3>If your work was shared without permission</h3>
        <p>
          Anyone can report a recipe in The Mix with <strong>Report → Copied from someone else</strong>. To send a formal copyright notice
          {email ? (
            <>
              , email <a href={`mailto:${email}`}>{email}</a>
            </>
          ) : (
            <> (our address for notices is being set up — until then, use Report in The Mix)</>
          )}{" "}
          with:
        </p>
        <ol>
          <li>your name, address, phone number and email, and your physical or electronic signature;</li>
          <li>the work you believe was copied (for example the cookbook and page);</li>
          <li>where it is in Cardamix — the recipe's name in The Mix, and its link if you have it;</li>
          <li>a statement that you believe in good faith the use isn't authorized by you, your agent or the law;</li>
          <li>a statement, under penalty of perjury, that your notice is accurate and that you're the owner or authorized to act for them.</li>
        </ol>
        <p>
          We take the recipe down promptly and let the person who published it know. If they believe it was taken down by mistake, they can
          send a counter-notice to the same address; we follow the process set out in US law (the DMCA).
        </p>

        <h3>Repeat infringers</h3>
        <p>
          Each recipe taken down after a copyright notice counts against the account that published it. After three, that account can't
          publish to The Mix any more, and we may close accounts that keep infringing.
        </p>

        <p className="muted small">
          See also the <a href={href({ name: "terms" })}>Terms of service</a>.
        </p>
      </main>
    </>
  );
}
