import Header from "./Header";
import { href } from "../lib/route";

export const TERMS_UPDATED = "November 15, 2026";
const CONTACT = "https://github.com/gossling8-debug/Recipe-Builder/issues";

/** Plain-language terms of service. Keep it in step with what the app and the Plus plan actually do. */
export default function TermsPage() {
  return (
    <>
      <Header title="Terms" back={href({ name: "settings" })} />
      <main className="page privacy">
        <h1 className="page-title">Terms of service</h1>
        <p className="muted small">Last updated {TERMS_UPDATED}</p>

        <p>
          These terms are the agreement between you and the developer of Cardamix (“we”) for using the Cardamix app and its services. By
          creating an account or using Cardamix, you agree to them. Please also read the{" "}
          <a href={href({ name: "privacy" })}>privacy policy</a>, which explains what is stored and who can see it.
        </p>

        <h3>Your account</h3>
        <ul>
          <li>You must be at least 13 years old to use Cardamix.</li>
          <li>Keep your password private. You're responsible for what happens in your account.</li>
          <li>You can delete your account at any time in Settings → Account.</li>
        </ul>

        <h3>Cardamix Plus</h3>
        <ul>
          <li>
            Plus is a subscription, billed monthly or yearly through Stripe at the price shown when you subscribe. It renews automatically
            until you cancel.
          </li>
          <li>
            <strong>Cancel any time</strong> from the Plus page (Manage subscription). You keep Plus until the end of the period you've
            paid for, and you won't be charged again.
          </li>
          <li>
            <strong>Refunds:</strong> payments aren't refundable for partly used periods, except where the law requires it. If you were
            charged by mistake or something went wrong, contact us within 30 days of the charge and we'll look into it.
          </li>
          <li>We'll tell you at least 30 days before a price change affects your subscription. You can cancel before it takes effect.</li>
        </ul>

        <h3>AI features and your monthly AI</h3>
        <ul>
          <li>
            Each plan includes a monthly amount of AI use (reading recipes, creating recipes, receipts and more). It resets each month,
            and unused AI doesn't carry over. We may adjust the amount, and the app always shows how much you've used.
          </li>
          <li>
            If you add your own Anthropic API key, those requests are billed to you by Anthropic under its terms, not by Cardamix.
          </li>
          <li>We may limit use that looks automated or abusive, to keep the service working for everyone.</li>
        </ul>

        <h3>Recipes, nutrition and food safety</h3>
        <ul>
          <li>
            Recipes read, created or suggested by AI can contain mistakes: amounts, times, temperatures or ingredients. Created recipes are
            untested. Use your own judgment, and check that meat, poultry, fish and eggs reach safe temperatures.
          </li>
          <li>
            <strong>Allergies and diets:</strong> always check every ingredient and label yourself. The “foods you avoid” setting helps, but
            it can miss things. Don't rely on Cardamix alone for an allergy or medical diet.
          </li>
          <li>Nutrition, cost, shelf-life and use-by estimates are approximate and aren't medical or financial advice.</li>
          <li>
            “Copycat” recipes are our own recreations, labeled “inspired by” a restaurant. Cardamix isn't affiliated with or endorsed by
            any restaurant or brand, and their names and trademarks belong to their owners.
          </li>
        </ul>

        <h3>Your content</h3>
        <ul>
          <li>
            Your recipes, photos, notes and memories stay yours. You give us permission only to store, sync and show them as the app needs
            to: on your devices, to the people in cookbooks you share with, and to everyone in The Mix if you publish there.
          </li>
          <li>
            Only add or share what you have the right to. A list of ingredients isn't protected, but someone else's written instructions,
            stories or photos can be, so don't publish another person's cookbook pages or photos as your own.
          </li>
        </ul>

        <h3>Rules for The Mix and shared cookbooks</h3>
        <p>When you publish to The Mix or share in a cookbook, don't post:</p>
        <ul>
          <li>anything that isn't a recipe (or a family memory, in a cookbook);</li>
          <li>hateful, harassing, sexual, violent or otherwise offensive content;</li>
          <li>spam, advertising or links to sell things;</li>
          <li>content copied from someone else without permission;</li>
          <li>anything dangerous or illegal, including recipes meant to cause harm.</li>
        </ul>
        <p>
          Anyone can report a recipe in The Mix. We may take down content that breaks these rules, and suspend or close accounts that
          break them repeatedly or seriously.
        </p>

        <h3>The service</h3>
        <ul>
          <li>
            We work to keep Cardamix running and your data safe, but it's provided “as is”: it may sometimes be unavailable, and features
            may change. Keep copies of anything you can't replace (you can share or print any recipe).
          </li>
          <li>
            To the extent the law allows, we aren't liable for indirect or consequential losses, and our total liability is limited to
            what you paid for Cardamix in the 12 months before the claim.
          </li>
          <li>
            Cardamix uses services from other companies — Google (Firebase), Stripe, Anthropic and GitHub — under their own terms.
          </li>
        </ul>

        <h3>Changes and contact</h3>
        <p>
          If these terms change, the date at the top changes too; for important changes we'll tell you in the app. Using Cardamix after
          a change means you accept the new terms. Questions:{" "}
          <a href={CONTACT} target="_blank" rel="noreferrer">
            contact the developer
          </a>
          .
        </p>
      </main>
    </>
  );
}
