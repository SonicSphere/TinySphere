// User-selected weights for each New look click. Repeats are intentional:
// forbidding consecutive classics would make an 80% classic share impossible.
export const FORM_WEIGHTS = Object.freeze({
  classic: 80,
  uncovered: 10,
  floatingCloths: 5,
  floatingLights: 5,
});

export function chooseForm(random = Math.random) {
  const roll = random() * 100;
  let upper = 0;
  for (const [form, weight] of Object.entries(FORM_WEIGHTS)) {
    upper += weight;
    if (roll < upper) return form;
  }
  return 'floatingLights';
}
