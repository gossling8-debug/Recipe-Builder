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
    case "pantry":
      return <PantryPage />;
    case "shopping":
      return <ShoppingList />;
    case "recipe":
      return <RecipePage id={route.id} />;
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
