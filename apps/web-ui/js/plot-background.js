// Crop photography is deliberately opt-in through the user presentation
// setting.  Keeping the resolver in one module makes all three role shells
// use the same crop aliases and fallback asset.
const PLOT_CROP_BACKGROUNDS = Object.freeze({
  tomato: new URL('../assets/crop-backgrounds/tomato.png', import.meta.url).href,
  corn: new URL('../assets/crop-backgrounds/corn.png', import.meta.url).href,
  cucumber: new URL('../assets/crop-backgrounds/cucumber.png', import.meta.url).href,
  rice: new URL('../assets/crop-backgrounds/rice.png', import.meta.url).href,
  sunflower: new URL('../assets/crop-backgrounds/sunflower.png', import.meta.url).href,
  strawberry: new URL('../assets/crop-backgrounds/strawberry.png', import.meta.url).href
});

const CROP_ALIASES = Object.freeze([
  ['tomato', ['tomato', '番茄']],
  ['corn', ['corn', '玉米']],
  ['cucumber', ['cucumber', '黄瓜']],
  ['rice', ['rice', '水稻', '稻']],
  ['sunflower', ['sunflower', '向日葵', '油葵']],
  ['strawberry', ['strawberry', '草莓']]
]);

const DEFAULT_BACKGROUND = new URL('../assets/backgrounds/farm-day.png', import.meta.url).href;

export function cropBackgroundFor(plot = {}) {
  const cropText = `${plot.cropCode || ''} ${plot.crop || ''} ${plot.cropName || ''}`.trim().toLowerCase();
  const match = CROP_ALIASES.find(([, names]) => names.some(name => cropText.includes(name)));
  return PLOT_CROP_BACKGROUNDS[match?.[0]] || DEFAULT_BACKGROUND;
}
