import Header from "./Header";
import { href } from "../lib/route";

export const PRIVACY_UPDATED = "November 12, 2026";
const CONTACT = "https://github.com/gossling8-debug/Recipe-Builder/issues";

/** Plain-language privacy policy. Keep it in step with what the app actually does. */
export default function PrivacyPage() {
  return (
    <>
      <Header title="Privacy" back={href({ name: "settings" })} />
      <main className="page privacy">
        <h1 className="page-title">Privacy policy</h1>
        <p className="muted small">Last updated {PRIVACY_UPDATED}</p>

        <p>
          Cardamix is built to keep your recipes yours. There are no ads, no tracking or analytics, and your information is never
          sold or shared for marketing. This page explains what is stored, where, and who can see it.
        </p>

        <h3>On your phone</h3>
        <p>
          Everything you add — recipes, photos, notes, your pantry, shopping list, week plan, prices, budget and settings — is saved in
          your browser's storage on your device. It stays there until you delete it or clear this site's data. Your Anthropic API key is
          also stored only on your device. If you turn on the app lock, your passcode is stored only in scrambled form on this device, and Face ID is checked by
          your phone itself — the app never receives any face data.
        </p>

        <h3>When you use AI features</h3>
        <p>
          Reading a recipe card, importing a web page or pasted text, nutrition estimates, substitutes, receipt import and “Cook with what
          I have” send what's needed for that task to Anthropic's Claude service. That can include photos, screenshots or video frames you
          choose, recipe text, a web address, pantry items and foods you avoid. It passes through Cardamix's server, which checks that
          you're signed in and records how much AI you've used this month (amounts only, not what you sent); the content isn't stored
          there. If you add your own Anthropic API key, requests go straight from your device to Anthropic instead. Anthropic handles
          this under{" "}
          <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noreferrer">
            its own privacy policy
          </a>{" "}
          and its terms for API customers. Nothing is sent to Anthropic unless you start one of these features.
        </p>

        <h3>Your account and cloud backup</h3>
        <p>
          Cardamix needs an account, so your recipes are never only on one phone. Your email address and account are handled by
          Google Firebase Authentication. Passwords are
          stored by Google in scrambled (hashed) form; neither the app nor its developer can see them. Your recipes, photos, lists and
          settings — everything except your Anthropic API key — are copied to Google Cloud Firestore so they can sync between your
          devices. Data is encrypted in transit and at rest by Google.
        </p>
        <p>
          Database rules allow only your signed-in account to read or change your data. As the operator of the service, the app's
          developer can technically view stored data in the Firebase console, and will only do so if needed to fix a problem you report
          or if required by law. Data is not end-to-end encrypted.
        </p>

        <h3>Payments</h3>
        <p>
          Cardamix Plus is paid through Stripe. Your card details go directly to Stripe and are never seen or stored by Cardamix. Cardamix
          keeps only your Stripe customer number and whether your subscription is active, so it knows to unlock Plus. Stripe handles
          payment information under{" "}
          <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">
            its own privacy policy
          </a>
          .
        </p>

        <h3>Cookbooks</h3>
        <p>
          Recipes, memories and photos you add to a shared cookbook (including its cover page), and the display name you choose, are
          visible to everyone in that cookbook. Your own recipe box, photos and notes are not shared. Anyone with a cookbook's invite link can join it, so share links only with people
          you trust.
        </p>

        <h3>The Mix</h3>
        <p>
          A recipe you publish to The Mix — the recipe as you cook it, the name you publish under and when you published it — can be seen
          by anyone with a Cardamix account. Your email, photos and notes are never published. Recipes from a website are published as a
          title and a link only. Ratings show as totals, not who gave them. Reports go privately to the app's administrators, who can take
          down any recipe. You can take your recipes out of The Mix at any time; copies others already saved stay theirs.
        </p>

        <h3>Other services you choose to open</h3>
        <ul>
          <li>Walmart and H-E-B buttons open that store's search for the ingredient's name.</li>
          <li>“Add to calendar” opens Google Calendar with the meal's name and time.</li>
          <li>Share links put the recipe itself in the link; whoever you send it to can read it.</li>
          <li>
            Voice commands use your phone's or browser's own speech recognition, which may be processed by its maker (for example
            Google or Apple).
          </li>
        </ul>
        <p>
          The app is hosted on GitHub Pages. Like most web hosts, GitHub may keep basic technical logs such as IP addresses when the
          app loads.
        </p>

        <h3>Deleting your data</h3>
        <ul>
          <li>
            <strong>Everything:</strong> Settings → Account → <em>Delete my account</em> permanently removes your account and everything
            backed up with it, including recipes you shared to cookbooks, and clears this phone.
          </li>
          <li>
            <strong>Signing out</strong> keeps your data in your account and on this phone. If someone else signs in on the same phone,
            the app shows their data instead; yours stays in your account.
          </li>
        </ul>

        <h3>Children</h3>
        <p>Cardamix is not directed at children under 13, and cloud accounts are not meant for them.</p>

        <h3>Changes and contact</h3>
        <p>
          If this policy changes, the date at the top changes too. Questions or requests:{" "}
          <a href={CONTACT} target="_blank" rel="noreferrer">
            contact the developer
          </a>
          .
        </p>
      </main>
    </>
  );
}
