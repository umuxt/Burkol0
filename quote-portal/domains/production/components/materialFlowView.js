/**
 * Material Flow Visualization (Rewrite)
 *
 * Goals
 * - Render material flow (read-only visualization) for production plan canvas
 * - Support linear flows and multiple N-from-1-to convergences with nested branches
 * - Strict token rules:
 *   - Raw materials (codes starting with M-) → black text lines
 *   - Intermediate/outputs (e.g., Bo-001, As-003) → grey badges
 *   - Final outputs (end nodes) → green box with plain text
 * - Start nodes (no predecessors) → 2px outline, rounded corners
 * - End nodes (no successors) → green, 2px outline, no radius
 * - Convergence capsules: single outer capsule per convergence, rows = branches
 *   Each row tokens are ordered raw-first then intermediate
 */

import { planDesignerState } from '../js/planDesigner.js';

const FONT_STACK = `'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif`;
const TEXT_STYLE = `font-size: 12px; font-weight: 400; font-family: ${FONT_STACK}; color: #111827`;
const ARROW_SPACING = 28;
const NODE_STEP = 80;
const CAPSULE_GAP = 20;

// --------------- Utils -----------------

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asIdString(id) {
  if (id === null || id === undefined) return '';
  if (typeof id === 'object' && id.id !== undefined) return String(id.id);
  return String(id);
}

function codeFromMaterial(m) {
  if (!m) return '';
  const candidates = [m.code, m.materialCode, m.semiCode, m.id, m.name]
    .filter(v => typeof v === 'string' && v.trim().length);
  for (const c of candidates) {
    const t = String(c);
    const mcode = t.match(/[A-Za-z]{1,3}-\d{2,4}/);
    if (mcode) return mcode[0];
  }
  return '';
}

// --------------- Graph build -----------------

function buildGraph(nodes) {
  const nodeMap = new Map(nodes.map(n => [asIdString(n.id), n]));
  const preds = new Map();
  const succs = new Map();
  const allConnections = [];

  for (const n of nodes) {
    const id = asIdString(n.id);
    preds.set(id, new Set());
    succs.set(id, new Set());
  }

  for (const n of nodes) {
    const fromId = asIdString(n.id);
    const outs = Array.isArray(n.connections) ? n.connections : [];
    for (const to of outs) {
      const toId = asIdString(to);
      if (!preds.has(toId) || !succs.has(fromId)) continue;
      preds.get(toId).add(fromId);
      succs.get(fromId).add(toId);
      allConnections.push({ from: fromId, to: toId });
    }
  }

  return { nodeMap, preds, succs, allConnections };
}

function topoSort(nodeMap, succs) {
  const indeg = new Map();
  for (const id of nodeMap.keys()) indeg.set(id, 0);
  for (const [u, outs] of succs.entries()) for (const v of outs) indeg.set(v, (indeg.get(v) || 0) + 1);
  const q = [];
  for (const [id, d] of indeg.entries()) if (d === 0) q.push(id);
  const order = [];
  while (q.length) {
    const u = q.shift();
    order.push(u);
    for (const v of succs.get(u) || []) {
      indeg.set(v, indeg.get(v) - 1);
      if (indeg.get(v) === 0) q.push(v);
    }
  }
  return order;
}

function isStartNode(id, preds) { return (preds.get(id) || new Set()).size === 0; }
function isEndNode(id, succs) { return (succs.get(id) || new Set()).size === 0; }

// Walk upstream from a node until reaching a start or a convergence (pred>1)
function gatherUpstreamChain(toId, preds, nodeMap) {
  const chain = [];
  let currentId = toId;
  const visitedLocal = new Set();
  while (currentId && !visitedLocal.has(currentId)) {
    visitedLocal.add(currentId);
    const pset = preds.get(currentId) || new Set();
    chain.push(nodeMap.get(currentId));
    if (pset.size !== 1) break; // stop at start (0) or another convergence (>1)
    currentId = Array.from(pset)[0];
  }
  chain.reverse(); // start -> ... -> toId
  return chain;
}

// --------------- Flow model -----------------

// Compose display tokens for a node
function composeNodeInputs(nodeId, graph) {
  const { nodeMap, preds } = graph;
  const node = nodeMap.get(nodeId);
  const rawInputs = [];
  const interInputs = [];

  // predecessor outputs as intermediate tokens
  for (const pid of (preds.get(nodeId) || [])) {
    const p = nodeMap.get(pid);
    if (p && p.semiCode) interInputs.push(String(p.semiCode));
  }

  // raw materials consumed at this node
  const rms = Array.isArray(node.materialInputs) ? node.materialInputs : [];
  for (const rm of rms) {
    if (rm && rm.derivedFrom) continue; // auto
    const code = codeFromMaterial(rm);
    if (code) rawInputs.push(code);
  }

  return { rawInputs, interInputs };
}

// Compose tokens for a chain step box (previous step output + current raw)
function composeChainStepTokens(prevNode, node) {
  const interInputs = [];
  if (prevNode && prevNode.semiCode) interInputs.push(String(prevNode.semiCode));
  const rawInputs = [];
  const rms = Array.isArray(node.materialInputs) ? node.materialInputs : [];
  for (const rm of rms) {
    if (rm && rm.derivedFrom) continue;
    const code = codeFromMaterial(rm);
    if (code) rawInputs.push(code);
  }
  return { rawInputs, interInputs };
}

function analyzeFlow(nodes) {
  const graph = buildGraph(nodes);
  const order = topoSort(graph.nodeMap, graph.succs);

  const blocks = [];
  const seen = new Set();
  const isConvergence = id => (graph.preds.get(id) || new Set()).size > 1;

  // Pre-reserve nodes that will be drawn inside capsules to avoid duplicates
  const reservedInCapsules = new Set();
  const convergenceIds = order.filter(id => isConvergence(id));
  convergenceIds.forEach(cid => {
    const directPreds = Array.from(graph.preds.get(cid) || []);
    directPreds.forEach(pid => {
      const chain = gatherUpstreamChain(pid, graph.preds, graph.nodeMap);
      chain.forEach(n => reservedInCapsules.add(asIdString(n.id)));
    });
  });

  for (const id of order) {
    if (seen.has(id)) continue;

    if (isConvergence(id)) {
      // Convergence group
      const directPreds = Array.from(graph.preds.get(id));
      const branches = [];
      const mark = [];
      for (const pid of directPreds) {
        const chain = gatherUpstreamChain(pid, graph.preds, graph.nodeMap); // start..pid
        // convert to chain boxes
        const boxes = [];
        for (let i = 0; i < chain.length; i++) {
          const curr = chain[i];
          const prev = i === 0 ? null : chain[i - 1];
          if (i === 0) {
            // start box uses only its raw inputs
            const rms = Array.isArray(curr.materialInputs) ? curr.materialInputs : [];
            const rawOnly = [];
            for (const rm of rms) {
              if (rm && rm.derivedFrom) continue;
              const code = codeFromMaterial(rm); if (code) rawOnly.push(code);
            }
            boxes.push({ rawInputs: rawOnly, interInputs: [], isStart: true });
          } else {
            const tokens = composeChainStepTokens(prev, curr);
            boxes.push({ ...tokens, isStart: false });
          }
          mark.push(asIdString(curr.id));
        }
        branches.push(boxes);
      }
      // mark all nodes in this capsule as seen; also mark the convergence
      for (const mid of mark) seen.add(mid);
      blocks.push({ type: 'capsule', targetId: id, branches });
      seen.add(id);
      continue;
    }

    // Skip simple nodes that are reserved for capsules
    if (reservedInCapsules.has(id)) { seen.add(id); continue; }

    // simple step
    blocks.push({ type: 'step', nodeId: id });
    seen.add(id);
  }

  return { graph, order, blocks };
}

// --------------- Rendering -----------------

export function renderMaterialFlow() {
  const container = document.getElementById('material-flow-container');
  if (!container) return;

  const nodes = Array.isArray(planDesignerState.nodes) ? planDesignerState.nodes : [];
  if (!nodes.length) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280; font-size: 14px;">Plan tasarladıktan sonra malzeme akışı burada görünecektir</div>';
    return;
  }

  try {
    const model = analyzeFlow(nodes);
    const html = renderFlow(model);
    container.innerHTML = html;
  } catch (err) {
    console.error('❌ Material flow rendering failed:', err);
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444; font-size: 14px;">Malzeme akışı görselleştirilemedi</div>';
  }
}

function renderFlow(model) {
  const { graph, blocks } = model;
  const segments = [];
  let left = 0;
  const blockHeights = blocks.map(measureBlockHeight);
  let maxHeight = Math.max(80, ...blockHeights);

  blocks.forEach((block, index) => {
    maxHeight = Math.max(maxHeight, blockHeights[index] || 0);

    if (block.type === 'capsule') {
      // Render branches capsule
      const capsuleHtml = renderCapsule(block.branches, left);
      segments.push(capsuleHtml);
      const capsuleWidth = measureCapsuleWidth(block.branches);
      left += capsuleWidth + CAPSULE_GAP; // spacing

      // Render convergence target as a simple input box (no output inside);
      const targetId = block.targetId;
      const inputs = composeNodeInputs(targetId, graph);
      const isEnd = isEndNode(targetId, graph.succs);
      const stepMaterials = { rawInputs: inputs.rawInputs, interInputs: inputs.interInputs, outputs: [] };
      segments.push(renderArrow(left));
      left += ARROW_SPACING;
      segments.push(renderNodeBox(stepMaterials, false, false, left, 0));
      left += NODE_STEP;

      // If end, render final product box (green) separately
      const target = graph.nodeMap.get(targetId);
      if (isEnd && target && target.semiCode) {
        segments.push(renderArrow(left));
        left += ARROW_SPACING;
        const finalMat = { rawInputs: [], interInputs: [], outputs: [String(target.semiCode)] };
        segments.push(renderNodeBox(finalMat, false, true, left, 0));
        left += NODE_STEP;
      }
    } else if (block.type === 'step') {
      const id = block.nodeId;
      const start = isStartNode(id, graph.preds);
      const end = isEndNode(id, graph.succs);
      const inputs = composeNodeInputs(id, graph);
      const materials = { rawInputs: inputs.rawInputs, interInputs: inputs.interInputs, outputs: [] };
      segments.push(renderNodeBox(materials, start, false, left, 0));
      left += NODE_STEP;
      if (end) {
        const node = graph.nodeMap.get(id);
        if (node && node.semiCode) {
          segments.push(renderArrow(left));
          left += ARROW_SPACING;
          const finalMat = { rawInputs: [], interInputs: [], outputs: [String(node.semiCode)] };
          segments.push(renderNodeBox(finalMat, false, true, left, 0));
          left += NODE_STEP;
        }
      }
    }

    const isLastBlock = index === blocks.length - 1;
    if (!isLastBlock) {
      segments.push(renderArrow(left));
      left += ARROW_SPACING;
    }
  });

  const flowWidth = Math.max(left, 120);
  const containerHeight = Math.max(80, maxHeight + 10);
  const inner = segments.join('');
  return `<div style="width: 100%; font-family: ${FONT_STACK}; color: #111827; font-size: 12px;">
    <div style="position: relative; width: 100%; min-height: ${containerHeight}px; height: ${containerHeight}px;">
      <div style="position: absolute; left: 50%; top: 50%; transform: translate(-${flowWidth / 2}px, -${containerHeight / 2}px); width: ${flowWidth}px; height: ${containerHeight}px;">
        ${inner}
      </div>
    </div>
  </div>`;
}

// ----- Capsule rendering -----

// branches: Array< Array<{rawInputs:string[], interInputs:string[], isStart?:boolean}> >
function renderCapsule(branches, left) {
  let html = '';
  html += `<div style="padding: 2.50px; left: ${left}px; top: 50%; transform: translateY(-50%); position: absolute; border-radius: 5px; outline: 1px black solid; outline-offset: -1px; box-shadow: 0.5px 0.5px 2px rgba(0, 0, 0, 0.1); flex-direction: column; justify-content: center; align-items: flex-end; gap: 9px; display: flex;">`;

  branches.forEach((boxes) => {
    if (!boxes.length) return;
    const [startBox, ...tail] = boxes;
    const rowPieces = [];
    rowPieces.push(renderInlineBox(startBox, true));
    tail.forEach(box => {
      rowPieces.push(renderInlineArrow());
      rowPieces.push(renderInlineBox(box, false));
    });
    html += `<div style="padding: 2.50px; border-radius: 5px; outline: 1px black solid; outline-offset: -1px; justify-content: flex-start; align-items: center; gap: 6px; display: flex;">${rowPieces.join('')}</div>`;
  });

  html += '</div>';
  return html;
}

function measureCapsuleWidth(branches) {
  const boxWidth = 80; // 66 width + gap + arrow allowance
  let maxBoxes = 1;
  branches.forEach(b => {
    if (!Array.isArray(b)) return;
    maxBoxes = Math.max(maxBoxes, b.length);
  });
  const padding = 20; // minimal padding for borders
  return maxBoxes * boxWidth + padding;
}

function measureBlockHeight(block) {
  if (block && block.type === 'capsule') {
    const rowCount = Math.max(1, block.branches.filter(branch => Array.isArray(branch) && branch.length).length);
    const rowHeight = 46; // approximate height of a row
    const gap = 9;
    const padding = 10;
    return rowCount * rowHeight + (rowCount - 1) * gap + padding;
  }
  return 80;
}

function renderArrow(left) {
  return `<div style="position: absolute; left: ${left}px; top: 50%; transform: translateY(-50%); width: ${ARROW_SPACING}px; height: 12px; display: flex; align-items: center; justify-content: center">
    <span style="font-size: 14px; font-family: ${FONT_STACK}; color: #111827;">&#8594;</span>
  </div>`;
}

function renderInlineArrow() {
  return `<div style="display: flex; align-items: center; justify-content: center; padding: 0 4px; font-size: 14px; font-family: ${FONT_STACK}; color: #111827; height: 100%;">&#8594;</div>`;
}

// ----- Box renderers -----

function renderNodeBox(materials, isStart, isEnd, left, top) {
  const styleParts = [
    'width: 66px', 'padding: 2.50px', `left: ${left}px`, 'top: 50%', 'transform: translateY(-50%)', 'position: absolute',
    'flex-direction: column', 'justify-content: flex-start', 'align-items: flex-start', 'gap: 4px', 'display: flex'
  ];
  if (isStart) styleParts.push('border-radius: 5px', 'outline: 2px black solid', 'outline-offset: -2px');
  else if (isEnd) styleParts.push('background: #3FED62', 'outline: 2px black solid', 'outline-offset: -2px');
  else styleParts.push('border-radius: 5px', 'outline: 1px black solid', 'outline-offset: -1px');

  let inner = '';

  // Inputs: raw black first, then intermediate grey
  (materials.rawInputs || []).forEach(tok => {
    inner += `<div style="${TEXT_STYLE}; word-wrap: break-word">${escapeHtml(tok)}</div>`;
  });
  (materials.interInputs || []).forEach(tok => {
    inner += `<div style="padding-left: 1.25px; padding-right: 1.25px; background: #BCB7B7; border-radius: 2.50px; justify-content: center; align-items: center; gap: 10px; display: inline-flex">` +
             `<div style="${TEXT_STYLE}; word-wrap: break-word">${escapeHtml(tok)}</div>` +
             `</div>`;
  });

  // Outputs: only for final green box
  (materials.outputs || []).forEach(tok => {
    inner += `<div style="${TEXT_STYLE}; word-wrap: break-word">${escapeHtml(tok)}</div>`;
  });

  return `<div style="${styleParts.join('; ')}">${inner}</div>`;
}

function renderInlineBox(box, isStart) {
  const styleParts = ['width: 66px', 'padding: 2.50px', 'flex-direction: column', 'justify-content: flex-start', 'align-items: flex-start', 'gap: 4px', 'display: inline-flex'];
  if (isStart) styleParts.push('border-radius: 5px', 'outline: 2px black solid', 'outline-offset: -2px');
  else styleParts.push('border-radius: 5px', 'outline: 1px black solid', 'outline-offset: -1px');

  let inner = '';
  // raw first then intermediate
  (box.rawInputs || []).forEach(tok => {
    inner += `<div style="${TEXT_STYLE}; word-wrap: break-word">${escapeHtml(tok)}</div>`;
  });
  (box.interInputs || []).forEach(tok => {
    inner += `<div style="padding-left: 1.25px; padding-right: 1.25px; background: #BCB7B7; border-radius: 2.50px; justify-content: center; align-items: center; gap: 10px; display: inline-flex">` +
             `<div style="${TEXT_STYLE}; white-space: nowrap;">${escapeHtml(tok)}</div>` +
             `</div>`;
  });
  return `<div style="${styleParts.join('; ')}">${inner}</div>`;
}
