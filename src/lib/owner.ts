import { callable } from "./subscription";

/** The owner dashboard's numbers (from the ownerStats server function; admins only). No names or emails. */
export interface OwnerStats {
  at: number;
  accounts: { total: number; verified: number; new7: number; new30: number; active7: number; active30: number };
  plus: { monthly: number; yearly: number; comp: number; beta: number; revenuePerMonth: number };
  ai: { month: string; spent: number; uses: number; people: number; byKind: Record<string, number>; byPlan: Record<string, number>; topSpends: number[] };
  content: { mixRecipes: number; mixReported: number; mixHidden: number; cookbooks: number };
  errors: {
    total: number;
    last7: number;
    groups: { message: string; count: number; lastAt: number; screens: string[]; apps: string[]; stack: string; device: string }[];
  };
}

export const ownerStats = () => callable<OwnerStats>("ownerStats");
export const clearErrorReports = () => callable<{ removed: number }>("ownerClearErrors");

/** What each AI request kind is called on the dashboard. */
export const KIND_LABELS: Record<string, string> = {
  scan: "Recipe adds",
  create: "Created recipes",
  receipt: "Receipts",
  nutrition: "Nutrition",
  substitutes: "Substitutes",
  pantryrecipe: "Cook with what I have", // the server lowercases the kind
  memory: "Memory typing",
  other: "Other",
};
