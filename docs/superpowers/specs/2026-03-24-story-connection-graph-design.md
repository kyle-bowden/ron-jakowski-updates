# Story Connection Graph Design

## Overview

A force-directed graph that visualizes how stories connect through shared tags. Accessed via a "View connections" button on each evidence card. Opens as a full-screen overlay on top of the evidence board.

## Entry Point

A "View connections" button in each evidence card's footer (alongside SOURCE and SHARE). Only shown on cards that have tags. Clicking it opens the graph overlay centered on that story.

## Graph Type

Force-directed physics graph rendered on Canvas 2D. No external libraries — uses simple spring physics similar to the existing particle system in `res/js/particles.js`.

- Stories are nodes
- Shared tags are edges between stories
- Connected stories cluster together naturally through physics simulation
- The simulation runs on `requestAnimationFrame` and settles over time

## Container

Full-screen dark overlay (`position: fixed; inset: 0`) on top of the evidence board with `z-index: 150`. Semi-transparent dark background (`rgba(0, 0, 0, 0.95)`). Close button (top-right corner) returns to the evidence board. Cork board texture as subtle low-opacity background image.

## Node Design

- **Selected story:** Larger node (radius ~40px), gold border (`--gold`), paper texture background, title text inside
- **Connected stories:** Smaller nodes (radius ~30px), lighter border, paper texture, truncated title
- **Tag edges:** Lines between stories that share a tag. Edge color matches the tag's pill color from the board. Tag name rendered as a label at the midpoint of the edge
- **Unconnected stories:** Not shown — only the selected story and stories sharing at least one tag appear

## Interactions

- **Click node:** Opens a tooltip/popup showing story title, summary (truncated), and a "Go to story" link that closes the overlay and scrolls to that card on the board
- **Pan:** Click and drag the background to pan the viewport
- **Zoom:** Scroll wheel / pinch to zoom in/out
- **Drag nodes:** Click and drag individual nodes to reposition them (pauses physics on that node while dragging)
- **Close:** Click X button or press Escape

## Data Flow

1. User clicks "View connections" on story card (story ID known)
2. Fetch connected stories from Supabase:
   ```sql
   SELECT DISTINCT s.id, s.post_title, s.content_summary,
     array_agg(DISTINCT t.name) as tags,
     array_agg(DISTINCT t.color) as tag_colors
   FROM stories s
   JOIN story_tags st ON s.id = st.story_id
   JOIN tags t ON st.tag_id = t.id
   WHERE t.id IN (
     SELECT tag_id FROM story_tags WHERE story_id = {selectedId}
   )
   GROUP BY s.id
   ```
3. Build node and edge data structures from the result
4. Initialize force simulation and render on canvas

## Physics Simulation

Simple spring model:
- **Repulsion:** All nodes repel each other (inverse square, like particles)
- **Attraction:** Nodes sharing a tag are pulled together by a spring force proportional to the number of shared tags
- **Damping:** Velocity decays each frame so the simulation settles
- **Center gravity:** Weak pull toward canvas center to keep the graph from drifting

No external physics library. ~50 lines of simulation code.

## File Changes

| File | Change |
|------|--------|
| `res/js/connection-graph.js` | **New** — graph rendering, physics, interactions |
| `board.html` | Add "View connections" button to card footer, overlay HTML container, script include |

## Mobile

On screens < 768px, the graph still renders as a full-screen overlay. Touch pan and pinch zoom supported via touch events. Node labels use smaller font size. Tooltip appears at bottom of screen instead of floating.

## Performance

- Canvas 2D rendering (not DOM nodes — no layout thrashing)
- Only connected stories are loaded and rendered (not the full database)
- Physics simulation uses `requestAnimationFrame` with damping — settles in ~2 seconds, then idles
- Simulation pauses when velocity drops below threshold
