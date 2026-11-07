import { useEffect } from "react";
import { useRoute } from "./lib/route";
import { requestPersistentStorage } from "./lib/db";
import Library from "./components/Library";
import Scanner from "./components/Scanner";
import Settings from "./components/Settings";
import RecipePage from "./components/RecipePage";

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
    case "recipe":
      return <RecipePage id={route.id} />;
    default:
      return <Library />;
  }
}
