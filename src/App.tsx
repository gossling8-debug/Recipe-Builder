import LockScreen from "./components/LockScreen";
import AccountScreen from "./components/AccountScreen";
import { cloudState, subscribeCloud } from "./lib/cloud";
import { forgetUnlockedActivity, loadLock, lockOnLoad, noteUnlockedActivity, shouldRelock } from "./lib/appLock";
import { Suspense, useEffect, useState } from "react";
import { lazyScreen, preloadScreens } from "./lib/lazyScreen";
import { applyTextSize, getTextSize } from "./lib/textSize";
import { applyTheme, getTheme } from "./lib/theme";
import { useRoute } from "./lib/route";
import { requestPersistentStorage } from "./lib/db";
import Library from "./components/Library";
import PlanWatcher from "./components/PlanWatcher";
import { startCloud } from "./lib/cloud";
import { InviteInBrowserNote } from "./components/PasteInvite";
import { startUpdateCheck } from "./lib/appUpdate";
import UpdateBar from "./components/UpdateBar";
import TabBar from "./components/TabBar";
import UndoBar from "./components/UndoBar";
import { Loading } from "./components/LogoLoader";

// Loaded when first opened (and fetched in the background soon after start).
const TipsPage = lazyScreen(() => import("./components/TipsPage"));
const PrivacyPage = lazyScreen(() => import("./components/PrivacyPage"));
const TermsPage = lazyScreen(() => import("./components/TermsPage"));
const PlusPage = lazyScreen(() => import("./components/PlusPage"));
const DuplicatesPage = lazyScreen(() => import("./components/DuplicatesPage"));
const Scanner = lazyScreen(() => import("./components/Scanner"));
const Settings = lazyScreen(() => import("./components/Settings"));
const RecipePage = lazyScreen(() => import("./components/RecipePage"));
const ShoppingList = lazyScreen(() => import("./components/ShoppingList"));
const PantryPage = lazyScreen(() => import("./components/PantryPage"));
const ImportPage = lazyScreen(() => import("./components/ImportPage"));
const WeekPage = lazyScreen(() => import("./components/WeekPage"));
const BigMealPage = lazyScreen(() => import("./components/BigMealPage"));
const PrintPage = lazyScreen(() => import("./components/PrintPage"));
const HistoryPage = lazyScreen(() => import("./components/HistoryPage"));
const StackScan = lazyScreen(() => import("./components/StackScan"));
const ReceiptPage = lazyScreen(() => import("./components/ReceiptPage"));
const TonightPage = lazyScreen(() => import("./components/TonightPage"));
const BudgetPage = lazyScreen(() => import("./components/BudgetPage"));
const PricesPage = lazyScreen(() => import("./components/PricesPage"));
const OwnerPage = lazyScreen(() => import("./components/OwnerPage"));
const PrintBookPage = lazyScreen(() => import("./components/BookPage"));
const CopyrightPage = lazyScreen(() => import("./components/CopyrightPage"));
const BookPage = lazyScreen(() => import("./components/Family").then((m) => ({ default: m.BookPage })));
const FamilyPage = lazyScreen(() => import("./components/Family").then((m) => ({ default: m.FamilyPage })));
const JoinPage = lazyScreen(() => import("./components/Family").then((m) => ({ default: m.JoinPage })));
const ShopJoinPage = lazyScreen(() => import("./components/SharedShopping").then((m) => ({ default: m.ShopJoinPage })));
const SharedRecipePage = lazyScreen(() => import("./components/Family").then((m) => ({ default: m.SharedRecipePage })));
const MixPage = lazyScreen(() => import("./components/Mix").then((m) => ({ default: m.MixPage })));
const MixRecipePage = lazyScreen(() => import("./components/Mix").then((m) => ({ default: m.MixRecipePage })));

function Screen() {
  const route = useRoute();
  switch (route.name) {
    case "scan":
      return <Scanner key={route.retake ? `retake-${route.retake}` : (route.book ?? "")} book={route.book} retake={route.retake} />;
    case "settings":
      return <Settings />;
    case "import":
      return <ImportPage data={route.data} />;
    case "family":
      // Keyed so going from one cookbook recipe to another starts fresh (no leftovers from the last).
      if (route.book && route.recipe) return <SharedRecipePage key={`${route.book}/${route.recipe}`} bookId={route.book} docId={route.recipe} />;
      return route.book ? <BookPage key={route.book} id={route.book} /> : <FamilyPage />;
    case "mix":
      return route.id ? <MixRecipePage key={route.id} id={route.id} /> : <MixPage />;
    case "join":
      return <JoinPage id={route.id} />;
    case "shopjoin":
      return <ShopJoinPage id={route.id} />;
    case "tips":
      return <TipsPage />;
    case "privacy":
      return <PrivacyPage />;
    case "terms":
      return <TermsPage />;
    case "duplicates":
      return <DuplicatesPage />;
    case "copyright":
      return <CopyrightPage />;
    case "book":
      return <PrintBookPage key={route.id ?? ""} id={route.id} order={route.order} />;
    case "owner":
      return <OwnerPage />;
    case "plus":
      return <PlusPage key={String(route.done)} done={route.done} />;
    case "prices":
      return <PricesPage />;
    case "tonight":
      return <TonightPage />;
    case "budget":
      return <BudgetPage />;
    case "receipt":
      return <ReceiptPage />;
    case "history":
      return <HistoryPage />;
    case "stack":
      return <StackScan />;
    case "print":
      return <PrintPage id={route.id} />;
    case "meal":
      return <BigMealPage key={location.hash} day={route.day} ids={route.ids} />;
    case "week":
      return <WeekPage />;
    case "pantry":
      return <PantryPage />;
    case "shopping":
      return <ShoppingList />;
    case "recipe":
      return <RecipePage key={route.id} id={route.id} />; // fresh state for each recipe
    default:
      return <Library />;
  }
}

// Screens without the bottom bar: opening a shared link, printing, joining a cookbook.
const NO_TAB_BAR = new Set(["import", "print", "join"]);

// Screens that simply show saved lists; they reload when another device's changes arrive.
// (Not screens where you might be mid-edit, like adding a recipe or a receipt.)
const RELOAD_ON_SYNC = new Set(["library", "settings", "tips", "tonight", "budget", "history", "week", "pantry", "shopping"]);

export default function App() {
  const route = useRoute();
  const [synced, setSynced] = useState(0);
  // Opening the app locks it; a refresh or pull-down while using it doesn't.
  const [locked, setLocked] = useState(() => lockOnLoad());
  // While unlocked and on screen, remember that (for this tab), so a refresh can tell.
  useEffect(() => {
    if (locked) return forgetUnlockedActivity();
    const note = () => document.visibilityState === "visible" && noteUnlockedActivity();
    note();
    const t = window.setInterval(note, 10_000);
    window.addEventListener("pagehide", note);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("pagehide", note);
    };
  }, [locked]);
  const [cloud, setCloud] = useState(cloudState());
  useEffect(() => subscribeCloud(setCloud), []);
  // An account is required (when the cloud is set up). The privacy policy and terms are readable without one.
  const needsAccount = cloud.status !== "off" && !cloud.uid && route.name !== "privacy" && route.name !== "terms" && route.name !== "copyright";
  // Lock again after time away. With "Immediately", lock as the app is hidden so the app switcher shows the lock.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const on = () => {
      const lock = loadLock();
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        if (lock && lock.after === 0) setLocked(true);
        else if (lock) noteUnlockedActivity(); // leaving: the "lock after" time counts from now
      } else if (shouldRelock(lock, hiddenAt, Date.now())) setLocked(true);
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    requestPersistentStorage().catch(() => {});
    preloadScreens();
    startUpdateCheck();
    startCloud().catch(() => {});
    void import("./lib/sharedShopping").then((m) => m.startSharedSync()).catch(() => {});
    void import("./lib/appConfig").then((m) => m.loadAppConfig()).catch(() => {}); // the owner's app-wide settings
    const on = () => {
      applyTextSize(getTextSize());
      applyTheme(getTheme(), false);
      setSynced((n) => n + 1);
    };
    window.addEventListener("state-synced", on);
    return () => window.removeEventListener("state-synced", on);
  }, []);
  return (
    <>
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
      <UpdateBar />
      {needsAccount ? (
        <>
          {(route.name === "join" || route.name === "shopjoin") && <InviteInBrowserNote />}
          <AccountScreen cloud={cloud} />
        </>
      ) : (
        <>
          <PlanWatcher />
          <Suspense
            fallback={
              <main className="page" aria-busy="true">
                <Loading delay={400} />
              </main>
            }
          >
            <Screen key={RELOAD_ON_SYNC.has(route.name) ? synced : -1} />
          </Suspense>
          {!NO_TAB_BAR.has(route.name) && <TabBar current={route.name} />}
          <UndoBar />
        </>
      )}
    </>
  );
}
