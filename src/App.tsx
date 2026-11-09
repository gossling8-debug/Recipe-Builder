import { useEffect } from "react";
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
import { BookPage, FamilyPage, JoinPage, SharedRecipePage } from "./components/Family";

function Screen() {
  const route = useRoute();
  useEffect(() => {
    requestPersistentStorage().catch(() => {});
    startCloud().catch(() => {});
  }, []);

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

export default function App() {
  return (
    <>
      <PlanWatcher />
      <Screen />
    </>
  );
}
