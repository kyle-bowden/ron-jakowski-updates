import { openai } from "./openai-client.js";
import { pool } from "./db.js";

export async function generatePolls(stories) {
  if (!stories.length) return;

  for (const story of stories) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You generate poll questions for Cal Jakowski's conspiracy theory channel on Telegram. Cal is a paranoid, passionate conspiracy researcher who believes the truth is being suppressed.

Each poll should engage Cal's audience with a provocative question about the story. Options should be 2-3 choices that feel authentic to conspiracy believers — not neutral, not academic. Think paranoid, passionate, opinionated. NEVER use simple yes/no.

Examples of good option styles:
- "100% REAL — I've seen the evidence"
- "THEY WANT YOU TO THINK IT'S FAKE"
- "I NEED MORE EVIDENCE before I go public"
- "This goes DEEPER than we thought"
- "Classic cover-up, wake up people"
- "The mainstream narrative is CRUMBLING"

Return JSON: { "question": "...", "options": ["...", "...", "..."] }`,
          },
          {
            role: "user",
            content: JSON.stringify({
              post_title: story.post_title,
              content_summary: story.content_summary,
            }),
          },
        ],
      });

      const result = JSON.parse(response.choices[0].message.content);

      await pool.query(
        `INSERT INTO polls (story_id, question, options) VALUES ($1, $2, $3)`,
        [story.id, result.question, JSON.stringify(result.options)]
      );

      console.log(`Poll generated for "${story.post_title}": ${result.question}`);
    } catch (err) {
      console.error(`Poll generation failed for "${story.post_title}":`, err.message);
    }
  }
}
