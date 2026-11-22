// A stand-in for Claude, for the click-through tests: reading a recipe returns a fixed recipe.
// The server's "ai" function is pointed here with ANTHROPIC_BASE_URL. Nothing here talks to Anthropic.
const http = require("http");
const PORT = Number(process.env.PORT || 4466);
let n = 0;
let unclear = false; // /test/unclear?on=1: the next reading says part of the card was hard to read
let nextTags = null; // /test/tags?t=Dinner,Beef: the next reading's labels

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
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: b.model,
          stop_reason: "end_turn",
          stop_sequence: null,
          content: [{ type: "text", text: JSON.stringify(recipe()) }],
          usage: { input_tokens: 2000, output_tokens: 300 },
        }),
      );
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`test AI on ${PORT}`));
