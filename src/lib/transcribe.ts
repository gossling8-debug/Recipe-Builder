import { describeApiError, makeClient, requestOptions, ScanError } from "./claude";
import { getModel } from "./models";
import { recordUsage } from "./usage";

/** Types out the writing in a photo of a page (e.g. a handwritten family memory), as written. */
export async function transcribePage(apiKey: string, photo: string): Promise<string> {
  const m = photo.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!m) throw new ScanError("That photo can't be read.");
  const client = await makeClient(apiKey);
  const model = getModel();
  let response;
  try {
    response = await client.beta.messages.create({
      ...requestOptions(model),
      max_tokens: 3000,
      system:
        "You type out the writing in a photo of a page from a family cookbook — often a handwritten memory or note. Copy the words exactly as written, keeping line breaks between paragraphs. Don't add a title, comments or quotation marks. If a word is unreadable, write [?]. If there is no writing, reply with nothing.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } },
            { type: "text", text: "Type out the writing on this page." },
          ],
        },
      ],
    });
  } catch (err) {
    throw new ScanError(describeApiError(err));
  }
  recordUsage("memory", model.id, response.usage);
  if (response.stop_reason === "refusal") throw new ScanError("Claude couldn't read this page.");
  return response.content
    .filter((b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .slice(0, 2000);
}
