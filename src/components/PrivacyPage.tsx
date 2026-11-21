import Header from "./Header";
import { href } from "../lib/route";

export const PRIVACY_UPDATED = "November 15, 2026";
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
          sold or shared for marketing. This page explains what is stored, where, and who can see it. See also the{" "}
          <a href={href({ name: "terms" })}>terms of service</a>.
        </p>

        <h3>On your phone</h3>
        <p>
          Everything you add — recipes, photos, notes, your pantry, shopping list, week plan, prices, budget, fast food spending and settings — is saved in
          your browser's storage on your device. It stays there until you delete it or clear this site's data. Your Anthropic API key is
          also stored only on your device. If you turn on the app lock, your passcode is stored only in scrambled form on this device, and Face ID is checked by
          your phone itself — the app never receives any face data.
        </p>

        <h3>When you use AI features</h3>
        <p>
          Reading a recipe card, importing a web page or pasted text, nutrition estimates, substitutes, receipt import, “Cook with what
          I have”, “Create a recipe” and typing out a cookbook memory page send what's needed for that task to Anthropic's Claude service.
          That can include photos, screenshots or video frames you choose, recipe text, a web address, what you ask to have created, pantry
          items, how many people you cook for, foods you avoid, and — for the two features that create recipes — the names of your saved
          recipes, so it doesn't suggest one you already have. Receipt import also sends the names on your shopping list, so what you
          bought can be ticked off; nutrition estimates also send the recipe's original card photos, if it has any, so nutrition facts
          printed on the card are used. It passes through Cardamix's server, which checks that you're signed in and records how much AI
          you've used this month — the cost and how many times you used each feature, not what you sent; the content isn't stored
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
          settings are copied to Google Cloud Firestore so they can sync between your devices. A few things stay only on the phone where
          you set them: your Anthropic API key, the app lock, the name you last published to The Mix under, and small preferences like
          tips you've dismissed. Data is encrypted in transit and at rest by Google.
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
          Recipes, memories, photos and ratings you add to a shared cookbook (including its cover page), and the display name you
          choose, are visible to everyone in that cookbook. If you leave the name blank, the part of your email address before the @ is
          used instead. Your own recipe box, photos and notes are not shared. Anyone with a cookbook's invite link can join it, so share links only with people
          you trust.
        </p>

        <h3>Shared shopping lists</h3>
        <p>
          If you share your shopping list, everyone on it sees the same list: the ingredients of the recipes on it (a copy, not your
          recipe box), each recipe's name, who added it, what's been ticked off and by whom, and the name you choose. Your pantry, prices,
          budget and everything else stay yours. Anyone with the list's invite link can join, so share it only with people you trust.
          When you stop sharing (or delete your account), your recipes and ticks come off the list and you keep a copy of it.
        </p>

        <h3>Cardamix Family households</h3>
        <p>
          On a Family plan, everyone in the household can see who's on it (the names each person chose) and shares one monthly AI
          allowance. Nothing else is shared: each person's recipes, lists, pantry and budget stay their own. The person who pays can take
          someone off the plan; anyone can leave. When the plan or an account ends, the household is removed.
        </p>

        <h3>Printed cookbooks</h3>
        <p>
          When you order a printed cookbook, the recipes, photos and wording you chose are sent to our print partner, Lulu, along with your
          name, delivery address, phone number (for the carrier) and email (for delivery updates). Payment is handled by Stripe; we never
          see your card. Your order is kept so you can track it, and deleted with your account.
        </p>

        <h3>Invites by email</h3>
        <p>
          When you invite someone to a shared shopping list or a cookbook by email, we store their email address, your name, and the
          list or cookbook's name, so the invite can wait for them in Cardamix. Only you and they (once they've confirmed that email) can
          see it. It's deleted when they join or decline, and when either of you deletes your account. We never email them or use the
          address for anything else.
        </p>

        <h3>The Mix</h3>
        <p>
          A recipe you publish to The Mix — the recipe as you cook it, the name you publish under and when you published it — can be seen
          by anyone with a Cardamix account. Your email, account and photos and notes are never published: which recipes are yours is
          kept privately, so a recipe published anonymously (“by Anonymous cook”) can't be traced to you or linked to your other recipes. Recipes from a website are published as a
          title and a link only. Ratings and reports are kept privately by Cardamix's server: everyone sees only the totals, never who gave
          them. Report reasons can be read only by the app's administrators, who can take down any recipe. To rate or report, your email
          address needs to be confirmed. You can take your recipes out of The Mix at any time; copies others already saved stay theirs.
        </p>

        <h3>Error reports</h3>
        <p>
          If the app runs into an error on your device, it sends a short technical report so the problem can be found and fixed: the
          error message, a short technical trace of where in the app's code it happened, which screen you were on (for example
          “recipe”) and which part of it, the app version and your browser and device type. It never includes your recipes, notes,
          photos, email or account. Reports are kept for 30 days and only the app's administrators can see them.
        </p>

        <h3>What the app's administrators see</h3>
        <p>
          Besides error reports, the administrators have a dashboard of totals: how many accounts there are and how many were active
          recently, how many have Plus, what AI has cost this month (overall, by feature and by plan, and the largest amounts spent by a
          single account, without saying whose), how many recipes are in The Mix and in cookbooks, and how many people reached each
          step toward upgrading (saw the Plus card, opened the plans page, used up the free recipe adds, tried the sample recipes) and
          how many of them now pay. For that, the app notes the first time you reach each step, with the time only. It shows no names,
          email addresses or recipes. If your confirmation email doesn't arrive, an administrator can mark your address as confirmed for you.
        </p>

        <h3>Other services you choose to open</h3>
        <ul>
          <li>
            Store buttons on the shopping list (Walmart, Target, Kroger, Costco, Aldi and the other stores you can choose) open that
            store's website or app with a search for the ingredient's name. The H-E-B app button opens the app and copies the
            ingredient's name for you to paste.
          </li>
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
            it stored: your recipes, photos and settings; what you added to cookbooks (recipes, memories, photos, ratings, and the cover
            page of any cookbook you own); recipes you published to The Mix; and your Mix ratings and reports. It also clears this
            phone. Cookbooks that other people are still in stay theirs. Stripe keeps its own payment records.
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
