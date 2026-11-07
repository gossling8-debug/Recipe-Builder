import { useEffect } from "react";
import { useRoute } from "./lib/route";
import { requestPersistentStorage } from "./lib/db";
import Library from "./components/Library";
import Scanner from "./components/Scanner";
import Settings from "./components/Settings";
import RecipePage from "./components/RecipePage";
import ShoppingList from "./components/ShoppingList";
import ImportPage from "./components/ImportPage";

export default function App() {
  const route = useRoute();
  useEffect(() => {
    requestPersistentStorage().catch(() => {});
  }, []);

  switch (route.name) {
    case "scan":
      return <Scanner />;
    case "settings":
      return <Settings />;
    case "import":
      return <ImportPage data={route.data} />;
    case "shopping":
      return <ShoppingList />;
    case "recipe":
      return <RecipePage id={route.id} />;
    default:
      return <Library />;
  }
}
