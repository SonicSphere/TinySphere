import { createFlowFrame, sampleMolten } from './fields.js';

export default {
  id: 'lava',
  name: 'Lava lagoon',
  description: 'Buoyant pools of slowly merging color',
  palette: 'lagoon',
  prepare: (input) => createFlowFrame(input, 7),
  sample: (x, y, z, frame, palette, color) => sampleMolten('lava', x, y, z, frame, palette, color),
};
