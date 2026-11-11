import TipsPage from "./components/TipsPage";
import PrivacyPage from "./components/PrivacyPage";
import LockScreen from "./components/LockScreen";
import AccountScreen from "./components/AccountScreen";
import { cloudState, subscribeCloud } from "./lib/cloud";
import { loadLock, shouldRelock } from "./lib/appLock";
import { useEffect, useState } from "react";
import { applyTextSize, getTextSize } from "./lib/textSize";
import { useRoute } from "./lib/route";
import { requestPersistentStorage } from "./lib/db";
import Library from "./components/Library";
import Scanner from "./components/Scanner";
import Settings from "./components/Settings";
import RecipePage from "./components/RecipePage";
import ShoppingList from "./components/ShoppingList";
import PlanWatcher from "./components/PlanWatcher";
import PantryPage from "./components/PantryPage";
import { startCloud } from "./lib/cloud";
import ImportPage from "./components/ImportPage";
import WeekPage from "./components/WeekPage";
import BigMealPage from "./components/BigMealPage";
import PrintPage from "./components/PrintPage";
import HistoryPage from "./components/HistoryPage";
import ReceiptPage from "./components/ReceiptPage";
import TonightPage from "./components/TonightPage";
import BudgetPage from "./components/BudgetPage";
import TabBar from "./components/TabBar";
import { BookPage, FamilyPage, JoinPage, SharedRecipePage } from "./components/Family";

function Screen() {
  const route = useRoute();
  switch (route.name) {
    case "scan":
      return <Scanner />;
    case "settings":
      return <Settings />;
    case "import":
      return <ImportPage data={route.data} />;
    case "family":
      if (route.book && route.recipe) return <SharedRecipePage bookId={route.book} docId={route.recipe} />;
      return route.book ? <BookPage id={route.book} /> : <FamilyPage />;
    case "join":
      return <JoinPage id={route.id} />;
    case "tips":
      return <TipsPage />;
    case "privacy":
      return <PrivacyPage />;
    case "tonight":
      return <TonightPage />;
    case "budget":
      return <BudgetPage />;
    case "receipt":
      return <ReceiptPage />;
    case "history":
      return <HistoryPage />;
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
  const [locked, setLocked] = useState(() => !!loadLock());
  const [cloud, setCloud] = useState(cloudState());
  useEffect(() => subscribeCloud(setCloud), []);
  // An account is required (when the cloud is set up). The privacy policy is readable without one.
  const needsAccount = cloud.status !== "off" && !cloud.uid && route.name !== "privacy";
  // Lock again after time away. With "Immediately", lock as the app is hidden so the app switcher shows the lock.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const on = () => {
      const lock = loadLock();
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        if (lock && lock.after === 0) setLocked(true);
      } else if (shouldRelock(lock, hiddenAt, Date.now())) setLocked(true);
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    requestPersistentStorage().catch(() => {});
    startCloud().catch(() => {});
    const on = () => {
      applyTextSize(getTextSize());
      setSynced((n) => n + 1);
    };
    window.addEventListener("state-synced", on);
    return () => window.removeEventListener("state-synced", on);
  }, []);
  return (
    <>
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
      {needsAccount ? (
        <AccountScreen cloud={cloud} />
      ) : (
        <>
          <PlanWatcher />
          <Screen key={RELOAD_ON_SYNC.has(route.name) ? synced : -1} />
          {!NO_TAB_BAR.has(route.name) && <TabBar current={route.name} />}
        </>
      )}
    </>
  );
}
