import { openai } from "./openai-client.js";
import { getExistingTags, saveStoryTags } from "./store.js";

export async function tagStories(stories) {
  if (!stories.length) return;

  const existingTags = await getExistingTags();
  const existingTagNames = existingTags.map((t) => t.name);

  const storySummaries = stories.map((s) => ({
    id: s.id,
    post_title: s.post_title,
    content_summary: s.content_summary,
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You assign tags to conspiracy theory stories to group related ones together.
Return JSON: { "assignments": [ { "id": <story_id>, "tags": ["tag-name", ...] } ] }
Rules:
- Use existing tags when they fit: [${existingTagNames.join(", ")}]
- New tags: 2-3 words, lowercase-hyphenated (e.g. "moon-landing", "deep-state")
- Stories about the same topic MUST share tags
- Each story gets 1-3 tags`,
      },
      {
        role: "user",
        content: JSON.stringify(storySummaries),
      },
    ],
  });

  const result = JSON.parse(response.choices[0].message.content);

  for (const assignment of result.assignments) {
    const story = stories.find((s) => s.id === assignment.id);
    if (!story) continue;
    await saveStoryTags(assignment.id, assignment.tags);
    console.log(`Tagged "${story.post_title}" with: ${assignment.tags.join(", ")}`);
  }
}
