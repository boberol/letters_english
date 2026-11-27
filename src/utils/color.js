// A colour as text on white. Borders and fills keep the bright colour of the
// shape, letter or card; text in that colour is darkened in the same hue until
// it reads at 4.5:1 - an amber or green title on white was about 2:1.
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function readable(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  let rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  for (let i = 0; i < 12 && 1.05 / (luminance(rgb) + 0.05) < 4.5; i++) {
    rgb = rgb.map((c) => Math.round(c * 0.88));
  }
  return `rgb(${rgb.join(', ')})`;
}
