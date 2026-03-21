import { z } from "zod";

export const storySchema = z.object({
  post_title: z.string(),
  post_title_citation: z.string().optional(),
  content_summary: z.string(),
  content_summary_citation: z.string().optional(),
  text_messages: z.array(z.string()),
  persona_summary: z.string(),
  persona_summary_citation: z.string().optional(),
  discussion_link: z.string(),
  discussion_link_citation: z.string().optional(),
});

export const firecrawlResponseSchema = z.object({
  trending_conspiracy_stories: z.array(storySchema),
});
