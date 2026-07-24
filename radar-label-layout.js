const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 600;
const DEFAULT_PADDING = 8;
const LABEL_HEIGHT = 14;
const CHAR_WIDTH = 6.2;
const MAX_LABEL_WIDTH = 118;
const SYMBOL_RADIUS = 22;

const CANDIDATES = Object.freeze([
  { x: 0, y: -30, textAnchor: 'middle' },
  { x: 28, y: 4, textAnchor: 'start' },
  { x: -28, y: 4, textAnchor: 'end' },
  { x: 0, y: 38, textAnchor: 'middle' },
  { x: 24, y: -24, textAnchor: 'start' },
  { x: -24, y: -24, textAnchor: 'end' },
  { x: 24, y: 30, textAnchor: 'start' },
  { x: -24, y: 30, textAnchor: 'end' },
]);

export function compactRadarLabel(name, altitudeText) {
  const callsign = String(name || '').trim().slice(0, 10);
  const altitude = String(altitudeText || '').trim();
  return [callsign, altitude].filter(Boolean).join(' · ');
}

export function layoutRadarLabels(items, options = {}) {
  const width = positiveNumber(options.width, DEFAULT_WIDTH);
  const height = positiveNumber(options.height, DEFAULT_HEIGHT);
  const padding = nonNegativeNumber(options.padding, DEFAULT_PADDING);
  const labelHeight = positiveNumber(options.labelHeight, LABEL_HEIGHT);
  const charWidth = positiveNumber(options.charWidth, CHAR_WIDTH);
  const maxLabelWidth = positiveNumber(options.maxLabelWidth, MAX_LABEL_WIDTH);
  const symbolRadius = positiveNumber(options.symbolRadius, SYMBOL_RADIUS);

  const normalised = items
    .map((item, index) => normaliseItem(item, index))
    .filter(Boolean);
  const symbolBoxes = normalised.map((item) => ({
    id: item.id,
    left: item.x - symbolRadius,
    right: item.x + symbolRadius,
    top: item.y - symbolRadius,
    bottom: item.y + symbolRadius,
  }));
  const ordered = [...normalised].sort((a, b) => {
    const selectedDifference = Number(b.selected) - Number(a.selected);
    return selectedDifference || a.index - b.index;
  });
  const placed = [];
  const placements = new Map();

  for (const item of ordered) {
    const labelWidth = Math.min(
      maxLabelWidth,
      Math.max(30, item.text.length * charWidth),
    );
    let best = null;

    CANDIDATES.forEach((candidate, candidateIndex) => {
      const box = labelBox(item, candidate, labelWidth, labelHeight);
      let score = candidateIndex * 3;
      score += outsideDistance(box, width, height, padding) * 200;

      for (const symbol of symbolBoxes) {
        if (symbol.id === item.id) continue;
        score += overlapArea(box, symbol) * 25;
      }
      for (const placedLabel of placed) {
        score += overlapArea(box, placedLabel.box) * 60;
      }

      if (!best || score < best.score) {
        best = { ...candidate, box, score };
      }
    });

    placements.set(item.id, {
      id: item.id,
      x: best.x,
      y: best.y,
      textAnchor: best.textAnchor,
      box: best.box,
    });
    placed.push({ id: item.id, box: best.box });
  }

  return normalised.map((item) => placements.get(item.id));
}

export function boxesOverlap(first, second) {
  return overlapArea(first, second) > 0;
}

function normaliseItem(item, index) {
  const x = Number(item?.x);
  const y = Number(item?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: String(item.id ?? index),
    index,
    x,
    y,
    text: String(item.text || '').trim(),
    selected: Boolean(item.selected),
  };
}

function labelBox(item, candidate, width, height) {
  const baseline = item.y + candidate.y;
  let left = item.x + candidate.x;
  if (candidate.textAnchor === 'middle') left -= width / 2;
  if (candidate.textAnchor === 'end') left -= width;
  return {
    left,
    right: left + width,
    top: baseline - height + 2,
    bottom: baseline + 2,
  };
}

function overlapArea(first, second) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}

function outsideDistance(box, width, height, padding) {
  return (
    Math.max(0, padding - box.left) +
    Math.max(0, box.right - (width - padding)) +
    Math.max(0, padding - box.top) +
    Math.max(0, box.bottom - (height - padding))
  );
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
