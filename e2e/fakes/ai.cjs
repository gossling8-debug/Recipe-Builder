// A stand-in for Claude, for the click-through tests: reading a recipe returns a fixed recipe.
// The server's "ai" function is pointed here with ANTHROPIC_BASE_URL. Nothing here talks to Anthropic.
const http = require("http");
const PORT = Number(process.env.PORT || 4466);
let n = 0;
let unclear = false; // /test/unclear?on=1: the next reading says part of the card was hard to read
let nextTags = null; // /test/tags?t=Dinner,Beef: the next reading's labels
let lastMessage = ""; // /test/last: the text of the last request's user message
let amountsInSteps = false; // /test/stepamounts: the next reading lists salt and oil with no amount; the steps give them
const seg = (text, ingredient_index = null, amount = null) => ({ text, ingredient_index, amount });
const stepAmountsRecipe = () => ({
  title: `Skillet Pasta ${++n}`,
  servings: "Serves 4",
  time: null,
  ingredients: [
    { quantity: "", unit: "", name: "kosher salt", preparation: null, section: null },
    { quantity: "", unit: "", name: "olive oil", preparation: null, section: null },
    { quantity: "3/4", unit: "lb", name: "penne", preparation: null, section: null },
  ],
  steps: [
    { segments: [seg("Bring water with "), seg("salt", 0, "2 Tbsp"), seg(" to a boil.")] },
    { segments: [seg("Heat "), seg("olive oil", 1, "1½ Tbsp"), seg(". Stir in "), seg("salt", 0, "1 tsp"), seg(".")] },
    { segments: [seg("Cook the "), seg("penne", 2, "3/4 lb"), seg(".")] },
  ],
  notes: null,
  tags: ["Dinner"],
  warnings: [],
  origin: { kind: "magazine", book: null, author: null },
});

const recipe = () => ({
  title: `Test Pie ${++n}`,
  servings: "Serves 4",
  time: "30 min",
  ingredients: [{ quantity: "1", unit: "cup", name: "flour", preparation: null, section: null }],
  steps: [
    { segments: [{ text: "Mix the ", ingredient_index: null, amount: null }, { text: "flour", ingredient_index: 0, amount: "1 cup" }, { text: ".", ingredient_index: null, amount: null }] },
    { segments: [{ text: "Bake 20 minutes.", ingredient_index: null, amount: null }] },
  ],
  notes: null,
  tags: nextTags ? ((t) => ((nextTags = null), t))(nextTags) : ["Dessert"],
  warnings: unclear ? ((unclear = false), ["The second line was hard to read; I guessed \"1 cup flour\"."]) : [],
  origin: { kind: "handwritten", book: null, author: null },
});

http
  .createServer((req, res) => {
    if (req.url.startsWith("/test/last")) {
      const out = lastMessage;
      if (req.url.includes("reset=1")) lastMessage = "";
      return res.end(out);
    }
    if (req.url.startsWith("/test/stepamounts")) {
      amountsInSteps = true;
      return res.end("ok");
    }
    if (req.url.startsWith("/test/tags")) {
      nextTags = (new URL(req.url, "http://x").searchParams.get("t") || "").split(",").filter(Boolean);
      return res.end("ok");
    }
    if (req.url.startsWith("/test/unclear")) {
      unclear = new URL(req.url, "http://x").searchParams.get("on") === "1";
      return res.end("ok");
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const b = JSON.parse(body || "{}");
      const user = (b.messages ?? []).filter((m) => m.role === "user").pop();
      lastMessage = typeof user?.content === "string" ? user.content : (user?.content ?? []).map((c) => c.text ?? "").join("\n");
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: b.model,
          stop_reason: "end_turn",
          stop_sequence: null,
          content: [{ type: "text", text: JSON.stringify(amountsInSteps ? ((amountsInSteps = false), stepAmountsRecipe()) : recipe()) }],
          usage: { input_tokens: 2000, output_tokens: 300 },
        }),
      );
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`test AI on ${PORT}`));
