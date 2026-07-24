export const RADAR_KEY_LABELS = Object.freeze({
  aircraft: 'Aircraft symbol',
  likely: 'Solid ring — likely audible',
  possible: 'Dashed ring — possibly audible',
  selected: 'Yellow ring — selected aircraft; solid or dashed still shows audibility',
  military: 'Shield — confirmed military',
  mlat: 'MLAT badge — position derived by multilateration',
});

export const RADAR_KEY_STYLES = `
.radar-key {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem 0.9rem;
  width: 100%;
  margin: 0 0 1rem;
  padding: 0.9rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  background: rgba(7, 16, 29, 0.56);
  color: var(--text);
  font-size: 0.92rem;
  line-height: 1.3;
}
.radar-key-item {
  display: grid;
  grid-template-columns: 2.1rem minmax(0, 1fr);
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.radar-key-sample {
  display: grid;
  place-items: center;
  width: 2.1rem;
  height: 2.1rem;
}
.radar-key-sample svg {
  display: block;
  width: 2rem;
  height: 2rem;
  overflow: visible;
}
.radar-key-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.1rem;
  min-height: 1.45rem;
  padding: 0.12rem 0.3rem;
  border: 2px solid var(--mlat);
  border-radius: 999px;
  color: var(--mlat);
  font-size: 0.62rem;
  font-weight: 900;
}
@media (max-width: 760px) {
  .radar-key { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .radar-key {
    grid-template-columns: 1fr;
    margin-inline: 0.35rem;
    width: calc(100% - 0.7rem);
  }
}
`;

function sampleSvg(content) {
  return `<span class="radar-key-sample" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false">${content}</svg></span>`;
}

function keyItem(sample, label) {
  return `<span class="radar-key-item">${sample}<span>${label}</span></span>`;
}

export function radarKeyMarkup() {
  return [
    keyItem(
      sampleSvg('<path d="M16 2 L19 11 L29 15 L29 19 L19 18 L19 25 L23 29 L23 31 L16 28 L9 31 L9 29 L13 25 L13 18 L3 19 L3 15 L13 11 Z" fill="var(--good)" stroke="#07101d" stroke-width="1.5"></path>'),
      RADAR_KEY_LABELS.aircraft,
    ),
    keyItem(
      sampleSvg('<circle cx="16" cy="16" r="10" fill="rgba(96, 230, 174, 0.2)" stroke="rgba(96, 230, 174, 0.9)" stroke-width="3"></circle>'),
      RADAR_KEY_LABELS.likely,
    ),
    keyItem(
      sampleSvg('<circle cx="16" cy="16" r="10" fill="rgba(96, 230, 174, 0.1)" stroke="rgba(96, 230, 174, 0.9)" stroke-width="3" stroke-dasharray="5 4"></circle>'),
      RADAR_KEY_LABELS.possible,
    ),
    keyItem(
      sampleSvg('<circle cx="16" cy="16" r="10" fill="rgba(255, 214, 61, 0.16)" stroke="var(--accent)" stroke-width="5"></circle>'),
      RADAR_KEY_LABELS.selected,
    ),
    keyItem(
      sampleSvg('<path d="M16 3 L27 9 L25 23 L16 29 L7 23 L5 9 Z" fill="rgba(255, 155, 97, 0.08)" stroke="var(--military)" stroke-width="3"></path>'),
      RADAR_KEY_LABELS.military,
    ),
    keyItem(
      '<span class="radar-key-sample" aria-hidden="true"><span class="radar-key-badge">MLAT</span></span>',
      RADAR_KEY_LABELS.mlat,
    ),
  ].join('');
}

export function enhanceRadarLegend(root = document) {
  const legend = root.querySelector('.radar-legend, .radar-key');
  const help = root.querySelector('.radar-help');
  if (!legend || !help) return false;

  legend.className = 'radar-key';
  legend.setAttribute('aria-label', 'Radar symbol key');
  legend.innerHTML = radarKeyMarkup();
  help.insertAdjacentElement('afterend', legend);

  if (!root.querySelector('#radar-key-styles')) {
    const style = root.createElement('style');
    style.id = 'radar-key-styles';
    style.textContent = RADAR_KEY_STYLES;
    root.head.append(style);
  }

  return true;
}

if (typeof document !== 'undefined') enhanceRadarLegend(document);
