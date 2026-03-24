# Story Connection Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a force-directed graph overlay that visualizes story connections through shared tags, accessed via a "View connections" button on each evidence card.

**Architecture:** New `res/js/connection-graph.js` handles all graph logic — data fetching, physics simulation, Canvas 2D rendering, and interactions. `board.html` gets the overlay container, "View connections" button in card footers, and the script include.

**Tech Stack:** Canvas 2D, Supabase REST API (existing client), vanilla JS (no libraries).

---

### Task 1: Add overlay container and CSS to board.html

**Files:**
- Modify: `board.html`

- [ ] **Step 1: Add overlay CSS**

Add before the `/* Scroll indicator */` or at the end of the `<style>` block in `board.html`:

```css
/* Connection graph overlay */
.graph-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(0, 0, 0, 0.95);
}

.graph-overlay.open {
  display: block;
}

.graph-overlay canvas {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.graph-overlay canvas:active {
  cursor: grabbing;
}

.graph-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(var(--gold-rgb), 0.4);
  color: var(--gold);
  font-size: 1.5rem;
  width: 40px;
  height: 40px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.graph-close:hover {
  background: rgba(var(--gold-rgb), 0.2);
}

.graph-tooltip {
  display: none;
  position: absolute;
  background: #f5f0e0;
  color: #222;
  padding: 1rem;
  max-width: 300px;
  box-shadow: 4px 6px 20px rgba(0, 0, 0, 0.5);
  font-family: var(--font);
  font-size: 0.75rem;
  z-index: 10;
}

.graph-tooltip.visible {
  display: block;
}

.graph-tooltip h4 {
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
  color: #1a1a1a;
}

.graph-tooltip p {
  margin-bottom: 0.5rem;
  line-height: 1.4;
}

.graph-tooltip a {
  color: var(--gold);
  text-decoration: none;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.graph-tooltip a:hover {
  text-decoration: underline;
}

.connect-btn {
  background: none;
  border: 1px solid #8b6914;
  color: #8b6914;
  font-family: var(--font);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.connect-btn:hover {
  background: #8b6914;
  color: #f5f0e0;
}

@media (max-width: 768px) {
  .graph-tooltip {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-width: none;
  }
}
```

- [ ] **Step 2: Add overlay HTML**

Add just before the closing `</body>` tag but before the `<script>` tags:

```html
<div class="graph-overlay" id="graphOverlay">
  <canvas id="graphCanvas"></canvas>
  <button class="graph-close" id="graphClose">✕</button>
  <div class="graph-tooltip" id="graphTooltip">
    <h4 id="graphTooltipTitle"></h4>
    <p id="graphTooltipSummary"></p>
    <a href="#" id="graphTooltipLink">GO TO STORY &rarr;</a>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add board.html
git commit -m "feat: add connection graph overlay container and CSS"
```

---

### Task 2: Add "View connections" button to card footer

**Files:**
- Modify: `board.html`

- [ ] **Step 1: Add button in card rendering JS**

In the `renderStories` function inside `board.html`, find where the share wrapper is added to the footer (around line 1420, after the `shareWrapper` block and before the tags block). Add a "View connections" button between the share wrapper and tags, but only if the story has tags:

```js
// Connection graph button (only if story has tags)
if (tags.length) {
  const connectBtn = document.createElement('button');
  connectBtn.className = 'connect-btn';
  connectBtn.textContent = 'CONNECTIONS';
  connectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openConnectionGraph(story.id);
  });
  footer.appendChild(connectBtn);
}
```

Add this AFTER the `footer.appendChild(shareWrapper);` line and BEFORE the `if (tags.length)` block that creates tag pills.

- [ ] **Step 2: Verify board loads**

Open `http://localhost:3000/board` and confirm cards with tags show a "CONNECTIONS" button in the footer. It won't work yet (no `openConnectionGraph` function) — just confirm it renders.

- [ ] **Step 3: Commit**

```bash
git add board.html
git commit -m "feat: add CONNECTIONS button to evidence card footer"
```

---

### Task 3: Create connection-graph.js — data fetching and graph building

**Files:**
- Create: `res/js/connection-graph.js`

- [ ] **Step 1: Create the file with data fetching and graph structure**

```js
// Connection Graph — force-directed visualization of story connections via shared tags
(() => {
  const overlay = document.getElementById('graphOverlay');
  const canvas = document.getElementById('graphCanvas');
  const ctx = canvas.getContext('2d');
  const closeBtn = document.getElementById('graphClose');
  const tooltip = document.getElementById('graphTooltip');
  const tooltipTitle = document.getElementById('graphTooltipTitle');
  const tooltipSummary = document.getElementById('graphTooltipSummary');
  const tooltipLink = document.getElementById('graphTooltipLink');

  let nodes = [];
  let edges = [];
  let selectedId = null;
  let animFrame = null;

  // Viewport state
  let panX = 0, panY = 0, zoom = 1;
  let dragging = null; // node being dragged
  let panning = false;
  let panStartX = 0, panStartY = 0;

  // Physics constants
  const REPULSION = 8000;
  const ATTRACTION = 0.005;
  const DAMPING = 0.85;
  const CENTER_GRAVITY = 0.01;
  const SETTLE_THRESHOLD = 0.5;

  async function fetchConnectedStories(storyId) {
    const supabase = window.SUPABASE_CLIENT;

    // Get tags for the selected story
    const { data: storyTags } = await supabase
      .from('story_tags')
      .select('tag_id')
      .eq('story_id', storyId);

    if (!storyTags || storyTags.length === 0) return [];

    const tagIds = storyTags.map(st => st.tag_id);

    // Get all stories that share these tags
    const { data: connectedStoryTags } = await supabase
      .from('story_tags')
      .select('story_id, tag_id, tags(name, color)')
      .in('tag_id', tagIds);

    if (!connectedStoryTags) return [];

    // Get unique story IDs
    const storyIds = [...new Set(connectedStoryTags.map(st => st.story_id))];

    // Fetch story details
    const { data: stories } = await supabase
      .from('stories')
      .select('id, post_title, content_summary')
      .in('id', storyIds);

    if (!stories) return [];

    // Build tag map per story
    const tagMap = {};
    for (const st of connectedStoryTags) {
      if (!tagMap[st.story_id]) tagMap[st.story_id] = [];
      tagMap[st.story_id].push({ name: st.tags.name, color: st.tags.color });
    }

    return stories.map(s => ({
      ...s,
      tags: tagMap[s.id] || [],
    }));
  }

  function buildGraph(stories, centerId) {
    nodes = [];
    edges = [];
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Create nodes with random positions around center
    for (const story of stories) {
      const isCenter = story.id === centerId;
      const angle = Math.random() * Math.PI * 2;
      const dist = isCenter ? 0 : 150 + Math.random() * 100;
      nodes.push({
        id: story.id,
        title: story.post_title || 'UNTITLED',
        summary: story.content_summary || '',
        tags: story.tags,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: isCenter ? 45 : 32,
        isCenter,
      });
    }

    // Create edges for shared tags
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const sharedTags = nodes[i].tags.filter(t1 =>
          nodes[j].tags.some(t2 => t1.name === t2.name)
        );
        if (sharedTags.length > 0) {
          edges.push({
            source: i,
            target: j,
            tags: sharedTags,
            strength: sharedTags.length,
          });
        }
      }
    }
  }

  // Physics simulation
  function simulate() {
    let totalVelocity = 0;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i] === dragging) continue;
      let fx = 0, fy = 0;

      // Repulsion from all other nodes
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = REPULSION / (dist * dist);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      // Attraction along edges
      for (const edge of edges) {
        let other = -1;
        if (edge.source === i) other = edge.target;
        else if (edge.target === i) other = edge.source;
        if (other === -1) continue;

        const dx = nodes[other].x - nodes[i].x;
        const dy = nodes[other].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = ATTRACTION * dist * edge.strength;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      // Center gravity
      fx += (cx - nodes[i].x) * CENTER_GRAVITY;
      fy += (cy - nodes[i].y) * CENTER_GRAVITY;

      nodes[i].vx = (nodes[i].vx + fx) * DAMPING;
      nodes[i].vy = (nodes[i].vy + fy) * DAMPING;
      nodes[i].x += nodes[i].vx;
      nodes[i].y += nodes[i].vy;

      totalVelocity += Math.abs(nodes[i].vx) + Math.abs(nodes[i].vy);
    }

    return totalVelocity;
  }

  // Rendering
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw edges
    for (const edge of edges) {
      const s = nodes[edge.source];
      const t = nodes[edge.target];
      const color = edge.tags[0]?.color || '#666';

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / zoom;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Tag label at midpoint
      const mx = (s.x + t.x) / 2;
      const my = (s.y + t.y) / 2;
      ctx.fillStyle = color;
      ctx.font = `${10 / zoom}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(edge.tags.map(t => t.name).join(', '), mx, my - 6 / zoom);
    }

    // Draw nodes
    for (const node of nodes) {
      // Node background
      ctx.beginPath();
      ctx.roundRect(
        node.x - node.radius,
        node.y - node.radius * 0.7,
        node.radius * 2,
        node.radius * 1.4,
        4 / zoom
      );
      ctx.fillStyle = node.isCenter ? '#f5e6a3' : '#f5f0e0';
      ctx.fill();
      ctx.strokeStyle = node.isCenter ? '#d4af37' : '#999';
      ctx.lineWidth = node.isCenter ? 2.5 / zoom : 1.5 / zoom;
      ctx.stroke();

      // Title text
      ctx.fillStyle = '#222';
      ctx.font = `bold ${(node.isCenter ? 11 : 9) / zoom}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Truncate title to fit
      const maxChars = Math.floor(node.radius * 2 / (6 / zoom));
      const title = node.title.length > maxChars
        ? node.title.slice(0, maxChars - 2) + '..'
        : node.title;

      // Word wrap
      const words = title.split(' ');
      const lines = [];
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (test.length > maxChars / 1.5 && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);

      const lineHeight = (node.isCenter ? 13 : 11) / zoom;
      const startY = node.y - ((lines.length - 1) * lineHeight) / 2;
      for (let i = 0; i < Math.min(lines.length, 3); i++) {
        ctx.fillText(lines[i], node.x, startY + i * lineHeight);
      }
    }

    ctx.restore();
  }

  function loop() {
    const velocity = simulate();
    render();
    if (velocity > SETTLE_THRESHOLD) {
      animFrame = requestAnimationFrame(loop);
    } else {
      render(); // final frame
      animFrame = null;
    }
  }

  function startSimulation() {
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = requestAnimationFrame(loop);
  }

  // Hit test — find node at screen coordinates
  function nodeAt(screenX, screenY) {
    const x = (screenX - panX) / zoom;
    const y = (screenY - panY) / zoom;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (x >= n.x - n.radius && x <= n.x + n.radius &&
          y >= n.y - n.radius * 0.7 && y <= n.y + n.radius * 0.7) {
        return n;
      }
    }
    return null;
  }

  // Interactions
  canvas.addEventListener('mousedown', (e) => {
    const node = nodeAt(e.offsetX, e.offsetY);
    if (node) {
      dragging = node;
    } else {
      panning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      tooltip.classList.remove('visible');
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
      dragging.x = (e.offsetX - panX) / zoom;
      dragging.y = (e.offsetY - panY) / zoom;
      dragging.vx = 0;
      dragging.vy = 0;
      render();
    } else if (panning) {
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      render();
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (dragging && !panning) {
      // If it was a click (not a drag), show tooltip
      const moved = Math.abs(dragging.vx) + Math.abs(dragging.vy);
      showTooltip(dragging, e.clientX, e.clientY);
    }
    dragging = null;
    panning = false;
  });

  canvas.addEventListener('click', (e) => {
    const node = nodeAt(e.offsetX, e.offsetY);
    if (node) {
      showTooltip(node, e.clientX, e.clientY);
    } else {
      tooltip.classList.remove('visible');
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const mx = e.offsetX, my = e.offsetY;
    panX = mx - (mx - panX) * factor;
    panY = my - (my - panY) * factor;
    zoom *= factor;
    zoom = Math.max(0.2, Math.min(3, zoom));
    render();
  }, { passive: false });

  // Touch support
  let lastTouchDist = 0;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const node = nodeAt(t.clientX - rect.left, t.clientY - rect.top);
      if (node) {
        dragging = node;
      } else {
        panning = true;
        panStartX = t.clientX - panX;
        panStartY = t.clientY - panY;
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      if (dragging) {
        const rect = canvas.getBoundingClientRect();
        dragging.x = (t.clientX - rect.left - panX) / zoom;
        dragging.y = (t.clientY - rect.top - panY) / zoom;
        render();
      } else if (panning) {
        panX = t.clientX - panStartX;
        panY = t.clientY - panStartY;
        render();
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist) {
        const factor = dist / lastTouchDist;
        zoom *= factor;
        zoom = Math.max(0.2, Math.min(3, zoom));
        render();
      }
      lastTouchDist = dist;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    dragging = null;
    panning = false;
    lastTouchDist = 0;
  });

  function showTooltip(node, x, y) {
    tooltipTitle.textContent = node.title;
    tooltipSummary.textContent = node.summary.length > 150
      ? node.summary.slice(0, 150) + '...'
      : node.summary;
    tooltipLink.href = '#';
    tooltipLink.onclick = (e) => {
      e.preventDefault();
      closeGraph();
      const card = document.getElementById(`story-${node.id}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('deeplink-highlight');
        setTimeout(() => card.classList.remove('deeplink-highlight'), 6000);
      }
    };

    // Position tooltip
    const isMobile = window.innerWidth < 768;
    if (!isMobile) {
      tooltip.style.left = Math.min(x + 10, window.innerWidth - 320) + 'px';
      tooltip.style.top = Math.min(y + 10, window.innerHeight - 200) + 'px';
      tooltip.style.bottom = '';
      tooltip.style.right = '';
    }
    tooltip.classList.add('visible');
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (nodes.length) render();
  }

  // Public API
  window.openConnectionGraph = async function(storyId) {
    selectedId = storyId;
    overlay.classList.add('open');
    resizeCanvas();
    panX = 0;
    panY = 0;
    zoom = 1;
    tooltip.classList.remove('visible');

    try {
      const stories = await fetchConnectedStories(storyId);
      if (stories.length === 0) {
        closeGraph();
        return;
      }
      buildGraph(stories, storyId);
      startSimulation();
    } catch (err) {
      console.error('Connection graph failed:', err);
      closeGraph();
    }
  };

  function closeGraph() {
    overlay.classList.remove('open');
    tooltip.classList.remove('visible');
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    nodes = [];
    edges = [];
  }

  closeBtn.addEventListener('click', closeGraph);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeGraph();
    }
  });
  window.addEventListener('resize', () => {
    if (overlay.classList.contains('open')) resizeCanvas();
  });
})();
```

- [ ] **Step 2: Verify the file loads without errors**

Add the script tag to `board.html` before the closing `</body>` tag (after the other `res/js/` script tags):

```html
<script src="res/js/connection-graph.js"></script>
```

Open `http://localhost:3000/board` and check the browser console for errors.

- [ ] **Step 3: Commit**

```bash
git add res/js/connection-graph.js board.html
git commit -m "feat: add connection graph with physics simulation and interactions"
```

---

### Task 4: End-to-end test

- [ ] **Step 1: Test the graph**

Open `http://localhost:3000/board`. Find a card with tags (e.g., one tagged `inside-job`). Click the "CONNECTIONS" button. The graph overlay should open showing the selected story centered with connected stories around it, linked by colored tag edges.

- [ ] **Step 2: Test interactions**

- Pan by dragging the background
- Zoom with scroll wheel
- Click a node to see the tooltip
- Click "GO TO STORY" to close graph and scroll to that card
- Press Escape to close
- On mobile: touch pan and pinch zoom

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: connection graph tested and working"
```
