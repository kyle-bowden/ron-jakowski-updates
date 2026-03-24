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
  let dragging = null;
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

    const { data: storyTags } = await supabase
      .from('story_tags')
      .select('tag_id')
      .eq('story_id', storyId);

    if (!storyTags || storyTags.length === 0) return [];

    const tagIds = storyTags.map(st => st.tag_id);

    const { data: connectedStoryTags } = await supabase
      .from('story_tags')
      .select('story_id, tag_id, tags(name, color)')
      .in('tag_id', tagIds);

    if (!connectedStoryTags) return [];

    const storyIds = [...new Set(connectedStoryTags.map(st => st.story_id))];

    const { data: stories } = await supabase
      .from('stories')
      .select('id, post_title, content_summary')
      .in('id', storyIds);

    if (!stories) return [];

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

  function simulate() {
    let totalVelocity = 0;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i] === dragging) continue;
      let fx = 0, fy = 0;

      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = REPULSION / (dist * dist);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

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

      const mx = (s.x + t.x) / 2;
      const my = (s.y + t.y) / 2;
      ctx.fillStyle = color;
      ctx.font = `${10 / zoom}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(edge.tags.map(t => t.name).join(', '), mx, my - 6 / zoom);
    }

    // Draw nodes
    for (const node of nodes) {
      const hw = node.radius;
      const hh = node.radius * 0.7;

      ctx.beginPath();
      ctx.rect(node.x - hw, node.y - hh, hw * 2, hh * 2);
      ctx.fillStyle = node.isCenter ? '#f5e6a3' : '#f5f0e0';
      ctx.fill();
      ctx.strokeStyle = node.isCenter ? '#d4af37' : '#999';
      ctx.lineWidth = node.isCenter ? 2.5 / zoom : 1.5 / zoom;
      ctx.stroke();

      ctx.fillStyle = '#222';
      ctx.font = `bold ${(node.isCenter ? 11 : 9) / zoom}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const charWidth = (node.isCenter ? 7 : 5.5) / zoom;
      const maxChars = Math.floor((hw * 2) / charWidth);
      const title = node.title.length > maxChars * 3
        ? node.title.slice(0, maxChars * 3 - 2) + '..'
        : node.title;

      const words = title.split(' ');
      const lines = [];
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (test.length > maxChars && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);

      const lineHeight = (node.isCenter ? 13 : 11) / zoom;
      const maxLines = 3;
      const visibleLines = lines.slice(0, maxLines);
      const startY = node.y - ((visibleLines.length - 1) * lineHeight) / 2;
      for (let i = 0; i < visibleLines.length; i++) {
        ctx.fillText(visibleLines[i], node.x, startY + i * lineHeight);
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
      render();
      animFrame = null;
    }
  }

  function startSimulation() {
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = requestAnimationFrame(loop);
  }

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

  // Mouse interactions
  let clickStart = null;

  canvas.addEventListener('mousedown', (e) => {
    clickStart = { x: e.clientX, y: e.clientY };
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
    const wasClick = clickStart &&
      Math.abs(e.clientX - clickStart.x) < 5 &&
      Math.abs(e.clientY - clickStart.y) < 5;

    if (wasClick) {
      const node = nodeAt(e.offsetX, e.offsetY);
      if (node) {
        showTooltip(node, e.clientX, e.clientY);
      } else {
        tooltip.classList.remove('visible');
      }
    }

    if (dragging && !wasClick) {
      startSimulation();
    }

    dragging = null;
    panning = false;
    clickStart = null;
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
      clickStart = { x: t.clientX, y: t.clientY };
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

  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length === 0 && clickStart) {
      const t = e.changedTouches[0];
      const wasClick = Math.abs(t.clientX - clickStart.x) < 10 &&
        Math.abs(t.clientY - clickStart.y) < 10;
      if (wasClick) {
        const rect = canvas.getBoundingClientRect();
        const node = nodeAt(t.clientX - rect.left, t.clientY - rect.top);
        if (node) showTooltip(node, t.clientX, t.clientY);
      }
    }
    dragging = null;
    panning = false;
    lastTouchDist = 0;
    clickStart = null;
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
