import { z } from "zod";

export const storySchema = z.object({
  post_title: z.string(),
  post_title_citation: z.string().describe("Source URL for post_title").optional(),
  content_summary: z.string(),
  content_summary_citation: z.string().describe("Source URL for content_summary").optional(),
  media_links: z.array(z.object({
    value: z.string(),
    value_citation: z.string().describe("Source URL for this value").optional(),
  })),
  text_messages: z.array(z.object({
    value: z.string(),
    value_citation: z.string().describe("Source URL for this value").optional(),
  })),
  persona_summary: z.string(),
  persona_summary_citation: z.string().describe("Source URL for persona_summary").optional(),
  discussion_link: z.string(),
  discussion_link_citation: z.string().describe("Source URL for discussion_link").optional(),
});

export const firecrawlResponseSchema = z.object({
  trending_conspiracy_stories: z.array(storySchema),
});
