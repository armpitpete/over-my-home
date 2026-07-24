import { compactRadarLabel, layoutRadarLabels } from './radar-label-layout.js';

export function parseRadarTranslate(value) {
  const match = String(value || '').match(/translate\(\s*(-?\d+(?:\.\d+)?)\s*(?:,|\s)\s*(-?\d+(?:\.\d+)?)\s*\)/i);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

export function enhanceRadarLabels(root = document) {
  const radar = root.querySelector('#sky-radar');
  const aircraftLayer = root.querySelector('#radar-aircraft');
  if (!radar || !aircraftLayer || typeof MutationObserver === 'undefined') return null;

  const requestFrame = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
  const cancelFrame = globalThis.cancelAnimationFrame || clearTimeout;
  let frameId = null;

  const layout = () => {
    frameId = null;
    const items = [...aircraftLayer.querySelectorAll('.radar-target')]
      .map((target, index) => {
        const label = target.querySelector('.radar-target-label');
        const altitudeLabel = target.querySelector('.radar-target-altitude');
        const position = parseRadarTranslate(target.getAttribute('transform'));
        if (!label || !position) return null;

        const callsign = label.dataset.callsign || label.textContent.split(' · ')[0].trim();
        label.dataset.callsign = callsign;
        const text = compactRadarLabel(callsign, altitudeLabel?.textContent);
        if (label.textContent !== text) label.textContent = text;

        return {
          id: target.dataset.aircraftId || String(index),
          x: position.x,
          y: position.y,
          text,
          selected: target.classList.contains('selected'),
          label,
        };
      })
      .filter(Boolean);

    const itemById = new Map(items.map((item) => [item.id, item]));
    for (const placement of layoutRadarLabels(items)) {
      const item = itemById.get(placement.id);
      if (!item) continue;
      item.label.setAttribute('x', String(placement.x));
      item.label.setAttribute('y', String(placement.y));
      item.label.setAttribute('text-anchor', placement.textAnchor);
    }

    radar.classList.add('labels-decluttered');
  };

  const scheduleLayout = () => {
    if (frameId !== null) return;
    frameId = requestFrame(layout);
  };

  const observer = new MutationObserver(scheduleLayout);
  observer.observe(aircraftLayer, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['transform', 'class'],
  });
  scheduleLayout();

  return {
    disconnect() {
      observer.disconnect();
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
    },
    layout,
  };
}

if (typeof document !== 'undefined') enhanceRadarLabels(document);
