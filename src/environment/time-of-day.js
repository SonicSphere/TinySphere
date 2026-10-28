export const DEFAULT_TIME_OF_DAY = 0.62;

export const SKY_PRESETS = ['sunrise', 'sunset', 'stars', 'peach-dusk'];
export const SKY_LABELS = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  stars: 'Starry night',
  'peach-dusk': 'Peach dusk',
};
export function presetFromTime(value) {
  return value >= 0.9 ? 'stars' : value < 0.45 ? 'sunrise' : 'sunset';
}

// Restore the original three skies with full artwork visibility and no sun fill.
// The continuous values remain readable for older saved views and API callers.
export function skyPresetLighting(atmosphere = 'sunset') {
  const stars = atmosphere === 'stars',
    photoDusk = atmosphere === 'peach-dusk' ? 1 : 0;
  return {
    timeOfDay: photoDusk ? 0.78 : stars ? 1 : atmosphere === 'sunrise' ? 0.35 : DEFAULT_TIME_OF_DAY,
    daylight: 0,
    dusk: stars ? 0 : 1,
    sunset: atmosphere === 'sunset' ? 1 : 0,
    stars: stars ? 1 : 0,
    photoDusk,
    artVisibility: 1,
  };
}

export function legacyTimeOfDay({ atmosphere, sky } = {}) {
  if (['stars', 'night'].includes(atmosphere)) return 1;
  const base =
    atmosphere === 'peach-dusk' ? 0.78 : atmosphere === 'sunrise' ? 0.35 : DEFAULT_TIME_OF_DAY;
  const blend = Number.isFinite(sky) ? Math.max(0, Math.min(1, sky)) : 1;
  return 1 - (1 - base) * blend;
}

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// One continuous scene control: bright sun at zero, stars at one. These are
// artistic response curves shared by the fabric and its surrounding setting.
export function timeOfDayLighting(value = DEFAULT_TIME_OF_DAY) {
  const timeOfDay = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_TIME_OF_DAY;
  const daylight = 1 - smooth(0.02, 0.62, timeOfDay);
  return {
    timeOfDay,
    daylight,
    dusk: 1 - smooth(0.5, 1, timeOfDay),
    sunset: smooth(0.12, 0.62, timeOfDay),
    stars: smooth(0.62, 0.98, timeOfDay),
    artVisibility: 1 - 0.86 * daylight,
  };
}
