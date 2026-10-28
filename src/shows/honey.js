import { createFlowFrame, sampleMolten } from './fields.js';

export default {
  id: 'honey',
  name: 'Honey tides',
  description: 'Golden islands stretch and join',
  palette: 'honey',
  prepare: (input) => createFlowFrame(input, 5),
  sample: (x, y, z, frame, palette, color) => sampleMolten('honey', x, y, z, frame, palette, color),
};
