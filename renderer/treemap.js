// ── Treemap rendering engine ──────────────────────────────────────────────────
// Squarified treemap layout algorithm + DOM-based rendering.
// Exposed as window.Treemap for use by app.js.

(function () {
  'use strict';

  // ── Color palette ──────────────────────────────────────────────────────────

  /** 10 distinct hues for top-level directories. */
  const PALETTE = [
    { h: 170, s: 70, l: 42 }, // teal/accent
    { h: 210, s: 65, l: 50 }, // blue
    { h: 280, s: 55, l: 50 }, // purple
    { h: 340, s: 60, l: 48 }, // pink
    { h:  30, s: 70, l: 45 }, // orange
    { h: 140, s: 55, l: 40 }, // green
    { h:  50, s: 65, l: 42 }, // yellow-brown
    { h: 195, s: 60, l: 45 }, // cyan
    { h: 320, s: 50, l: 48 }, // magenta
    { h:  10, s: 65, l: 45 }, // red-orange
  ];

  /**
   * Simple string hash → palette index for consistent directory colors.
   */
  function hashColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % PALETTE.length;
  }

  function dirColor(name, depth) {
    const base = PALETTE[hashColor(name)];
    // Dim slightly for deeper levels
    const lAdj = Math.max(20, base.l - depth * 5);
    const sAdj = Math.max(30, base.s - depth * 5);
    return `hsl(${base.h}, ${sAdj}%, ${lAdj}%)`;
  }

  // ── Tree builder ───────────────────────────────────────────────────────────

  /**
   * Build a nested tree from flat du output.
   * @param {Array<{ path: string, sizeKB: number }>} flatData
   * @returns {{ path: string, name: string, size: number, ownSize: number, children: Array }}
   */
  function buildTree(flatData) {
    if (!flatData || flatData.length === 0) return null;

    // Index by path for fast lookup
    const byPath = new Map();
    for (const item of flatData) {
      byPath.set(item.path, { path: item.path, size: item.sizeKB * 1024, children: [] });
    }

    // Find the root (shortest path, usually '/' or the target directory)
    let rootPath = flatData[flatData.length - 1]?.path || '/';
    // The last entry from `sort -rn` is smallest, but du outputs the target last
    // Actually with sort -rn, root (largest) is first. But du outputs root as last line.
    // After sort -rn, the root directory (largest total) will be the first entry.
    if (flatData.length > 0) {
      rootPath = flatData[0].path; // largest entry = root
      // But we should check: the actual root is the shortest path that is a prefix of all others
      for (const item of flatData) {
        if (item.path.length < rootPath.length) rootPath = item.path;
        else if (item.path.length === rootPath.length && item.path < rootPath) rootPath = item.path;
      }
    }

    const root = byPath.get(rootPath);
    if (!root) return null;

    // Sort entries by path length (shorter first) so parents come before children
    const sorted = [...byPath.entries()].sort((a, b) => a[0].length - b[0].length);

    // Build parent-child relationships
    for (const [p, node] of sorted) {
      if (p === rootPath) continue;
      // Find nearest ancestor in the map
      let parentPath = p.replace(/\/[^/]+\/?$/, '') || '/';
      // Walk up until we find a parent that exists in the map
      while (parentPath && !byPath.has(parentPath)) {
        parentPath = parentPath.replace(/\/[^/]+\/?$/, '') || '/';
        if (parentPath === '') parentPath = '/';
        if (parentPath === '/' && !byPath.has('/')) break;
      }
      const parent = byPath.get(parentPath);
      if (parent && parent !== node) {
        parent.children.push(node);
      }
    }

    // Compute ownSize (total minus children) and names
    function annotate(node) {
      const basename = node.path === '/' ? '/' : node.path.split('/').filter(Boolean).pop() || node.path;
      node.name = basename;
      let childSum = 0;
      for (const child of node.children) {
        annotate(child);
        childSum += child.size;
      }
      node.ownSize = Math.max(0, node.size - childSum);

      // Sort children by size descending
      node.children.sort((a, b) => b.size - a.size);
    }

    annotate(root);
    return root;
  }

  /**
   * Find a subtree by path within a tree.
   */
  function findNode(tree, targetPath) {
    if (!tree) return null;
    if (tree.path === targetPath) return tree;
    for (const child of tree.children) {
      const found = findNode(child, targetPath);
      if (found) return found;
    }
    return null;
  }

  // ── Squarify layout algorithm ──────────────────────────────────────────────

  function worst(row, w) {
    const s = row.reduce((a, b) => a + b.size, 0);
    if (s === 0 || w === 0) return Infinity;
    const s2 = s * s;
    const w2 = w * w;
    let maxR = 0;
    for (const item of row) {
      if (item.size === 0) continue;
      const r = Math.max((w2 * item.size) / s2, s2 / (w2 * item.size));
      if (r > maxR) maxR = r;
    }
    return maxR;
  }

  /**
   * Squarified treemap layout.
   * @param {Array<{ size: number, ... }>} items - Sorted descending by size.
   * @param {{ x: number, y: number, w: number, h: number }} rect
   * @returns {Array<{ x: number, y: number, w: number, h: number, item: Object }>}
   */
  function squarify(items, rect) {
    const results = [];
    if (!items || items.length === 0) return results;

    const totalSize = items.reduce((a, b) => a + b.size, 0);
    if (totalSize === 0 || rect.w <= 0 || rect.h <= 0) return results;

    // Normalize sizes to fill the rect area
    const area = rect.w * rect.h;
    const scaled = items.map(item => ({
      ...item,
      _area: (item.size / totalSize) * area,
    }));

    let remaining = [...scaled];
    let { x, y, w, h } = rect;

    while (remaining.length > 0) {
      const isWide = w >= h;
      const side = isWide ? h : w;

      // Try adding items to the current row
      const row = [remaining[0]];
      remaining = remaining.slice(1);
      let currentWorst = worst(row.map(r => ({ size: r._area })), side);

      while (remaining.length > 0) {
        const candidate = [...row, remaining[0]];
        const newWorst = worst(candidate.map(r => ({ size: r._area })), side);
        if (newWorst <= currentWorst) {
          row.push(remaining[0]);
          remaining = remaining.slice(1);
          currentWorst = newWorst;
        } else {
          break;
        }
      }

      // Layout this row
      const rowArea = row.reduce((a, b) => a + b._area, 0);
      const rowSize = side > 0 ? rowArea / side : 0;

      let offset = 0;
      for (const item of row) {
        const itemSize = rowSize > 0 ? item._area / rowSize : 0;
        if (isWide) {
          results.push({ x: x, y: y + offset, w: rowSize, h: itemSize, item });
          offset += itemSize;
        } else {
          results.push({ x: x + offset, y: y, w: itemSize, h: rowSize, item });
          offset += itemSize;
        }
      }

      // Shrink remaining rect
      if (isWide) {
        x += rowSize;
        w -= rowSize;
      } else {
        y += rowSize;
        h -= rowSize;
      }
    }

    return results;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  const MIN_BLOCK_PX = 18;  // Minimum block dimension to show
  const MIN_LABEL_PX = 40;  // Minimum dimension to show text labels

  /**
   * Render an interactive treemap into a container.
   *
   * @param {HTMLElement} container - Must have position:relative and known dimensions.
   * @param {Object} treeNode - The subtree to render (from buildTree/findNode).
   * @param {Object} opts
   * @param {function} opts.onDrillDown - Called with child node path when clicked.
   * @param {function} opts.formatSize - Format bytes to human string.
   * @param {number} [opts.depth=0] - Current depth (for color).
   */
  function renderTreemap(container, treeNode, opts = {}) {
    container.innerHTML = '';
    if (!treeNode || treeNode.size === 0) return;

    const { onDrillDown, formatSize = defaultFormatSize } = opts;
    const rect = {
      x: 0, y: 0,
      w: container.clientWidth,
      h: container.clientHeight,
    };

    if (rect.w === 0 || rect.h === 0) return;

    // Items to lay out: children + "own" (unaccounted space)
    const items = [];
    for (const child of treeNode.children) {
      if (child.size > 0) items.push(child);
    }
    if (treeNode.ownSize > 0) {
      items.push({
        path: treeNode.path + '/__other__',
        name: '\u2026', // ellipsis
        size: treeNode.ownSize,
        ownSize: treeNode.ownSize,
        children: [],
        _isOwnSpace: true,
      });
    }

    // Sort descending by size
    items.sort((a, b) => b.size - a.size);

    // Group very small items into "Other"
    const totalSize = items.reduce((a, b) => a + b.size, 0);
    const minItemSize = totalSize * 0.002; // 0.2% threshold
    const visible = [];
    let otherSize = 0;
    let otherCount = 0;
    for (const item of items) {
      if (item.size < minItemSize && !item._isOwnSpace) {
        otherSize += item.size;
        otherCount++;
      } else {
        visible.push(item);
      }
    }
    if (otherSize > 0) {
      visible.push({
        path: treeNode.path + '/__grouped__',
        name: 'Other',
        size: otherSize,
        ownSize: otherSize,
        children: [],
        _isGrouped: true,
        _groupedCount: otherCount,
      });
      visible.sort((a, b) => b.size - a.size);
    }

    const rects = squarify(visible, rect);

    // Create tooltip element (shared)
    const tooltip = document.createElement('div');
    tooltip.className = 'treemap-tooltip';
    container.appendChild(tooltip);

    for (const r of rects) {
      if (r.w < 2 || r.h < 2) continue;

      const block = document.createElement('div');
      block.className = 'treemap-block';
      block.style.left = r.x + 'px';
      block.style.top = r.y + 'px';
      block.style.width = Math.max(0, r.w - 2) + 'px'; // 2px for gap
      block.style.height = Math.max(0, r.h - 2) + 'px';

      const item = r.item;
      const isClickable = !item._isOwnSpace && !item._isGrouped && item.children && item.children.length > 0;

      block.style.backgroundColor = item._isOwnSpace
        ? 'rgba(255, 255, 255, 0.04)'
        : item._isGrouped
          ? 'rgba(255, 255, 255, 0.06)'
          : dirColor(item.name, 0);

      if (isClickable) {
        block.style.cursor = 'pointer';
        block.addEventListener('click', () => {
          if (onDrillDown) onDrillDown(item.path);
        });
      }

      // Label (directory name)
      if (r.w > MIN_LABEL_PX && r.h > MIN_LABEL_PX) {
        const label = document.createElement('div');
        label.className = 'treemap-label';

        let displayName = item.name;
        if (item._isGrouped) {
          displayName = 'Other (' + item._groupedCount + ')';
        } else if (item._isOwnSpace) {
          displayName = '(files)';
        }

        label.textContent = displayName;
        block.appendChild(label);

        // Size sub-label
        const size = document.createElement('div');
        size.className = 'treemap-size';
        size.textContent = formatSize(item.size);
        block.appendChild(size);

        // Percentage
        if (totalSize > 0) {
          const pct = document.createElement('div');
          pct.className = 'treemap-pct';
          pct.textContent = ((item.size / totalSize) * 100).toFixed(1) + '%';
          block.appendChild(pct);
        }
      } else if (r.w > MIN_BLOCK_PX && r.h > MIN_BLOCK_PX) {
        // Small block: show abbreviated name only
        const label = document.createElement('div');
        label.className = 'treemap-label treemap-label-sm';
        label.textContent = item._isOwnSpace ? '...' : item.name;
        block.appendChild(label);
      }

      // Tooltip on hover
      block.addEventListener('mouseenter', (e) => {
        let tooltipPath = item._isOwnSpace ? '(files in ' + treeNode.path + ')' : item._isGrouped ? otherCount + ' small items' : item.path;
        const pctStr = totalSize > 0 ? ((item.size / totalSize) * 100).toFixed(1) + '%' : '';
        tooltip.innerHTML = `<div class="treemap-tooltip-path">${escapeHtmlLocal(tooltipPath)}</div><div class="treemap-tooltip-size">${formatSize(item.size)} (${pctStr})</div>`;
        tooltip.classList.add('visible');
        positionTooltip(tooltip, e, container);
      });

      block.addEventListener('mousemove', (e) => {
        positionTooltip(tooltip, e, container);
      });

      block.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
      });

      container.appendChild(block);
    }
  }

  function positionTooltip(tooltip, e, container) {
    const cr = container.getBoundingClientRect();
    let left = e.clientX - cr.left + 12;
    let top = e.clientY - cr.top + 12;

    // Keep tooltip within container bounds
    const tw = tooltip.offsetWidth || 200;
    const th = tooltip.offsetHeight || 50;
    if (left + tw > cr.width) left = left - tw - 24;
    if (top + th > cr.height) top = top - th - 24;
    if (left < 0) left = 4;
    if (top < 0) top = 4;

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function defaultFormatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return val.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function escapeHtmlLocal(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  window.Treemap = {
    buildTree,
    findNode,
    squarify,
    renderTreemap,
  };
})();
