// User-selected weights for each New look click. Repeats are intentional:
// forbidding consecutive classics would make an 80% classic share impossible.
export const FORM_WEIGHTS = Object.freeze({
  classic: 80,
  uncovered: 10,
  floatingCloths: 5,
  floatingLights: 5,
});

export const SPHERE_VIEWS = Object.freeze({
  full: { label: 'Full sphere', cloths: true, tubes: false },
  tubes: { label: 'Light tubes', cloths: false, tubes: true },
  bare: { label: 'Bare sphere', cloths: false, tubes: false },
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

// Each roll selects visibility independently while preserving the frame form.
export const SPHERE_VIEW_WEIGHTS = Object.freeze({ full: 80, tubes: 10, bare: 10 });

export function chooseSphereView(random = Math.random) {
  const roll = random() * 100;
  let upper = 0;
  for (const [view, weight] of Object.entries(SPHERE_VIEW_WEIGHTS)) {
    upper += weight;
    if (roll < upper) return view;
  }
  return 'bare';
}
