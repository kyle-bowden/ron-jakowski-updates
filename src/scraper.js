import Firecrawl from "@mendable/firecrawl-js";
import { config } from "./config.js";
import { firecrawlResponseSchema } from "./schema.js";

const firecrawl = new Firecrawl({ apiKey: config.firecrawlApiKey });

const PROMPT = `Extract the latest trending conspiracy stories from Reddit that are currently relevant in the news. For each story, provide:

- 'post_title': a frantic, urgent headline (e.g., all caps, panicked phrasing).
- 'content_summary': a factual overview of the story.
- 'text_messages': an array of 3-5 short, frantic text messages as if someone is desperately trying to reach a friend about this story. Examples: "dude check twitter RIGHT NOW", "pick up pick up this is insane", "they're covering it up". These should feel like real panicked texts.
- 'persona_summary': a performance prompt for Voice AI.
- 'discussion_link': the direct URL to the Reddit thread.

Rules for 'persona_summary':
- Act as a paranoid conspiracy theorist urgently calling a friend.
- Speak like you're on a phone call, starting mid-thought.
- Include performance cues in brackets (e.g., [breathing heavily], [whispering], [panicked], [shouting]) based on the story's intensity.
- Connect real facts into a conspiracy.
- Keep it under 20 seconds of reading time.
- Use conversational filler words and phrases like "listen" or "you need to hear this" to sound natural.
- Tone: Manic but believable.`;

export async function scrapeStories() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

  try {
    const result = await firecrawl.agent({
      prompt: PROMPT,
      schema: firecrawlResponseSchema,
      model: "spark-1-pro",
    });

    if (!result || !result.data) {
      throw new Error("Firecrawl returned no data");
    }

    return result.data.trending_conspiracy_stories;
  } finally {
    clearTimeout(timeout);
  }
}
