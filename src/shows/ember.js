import { createFlowFrame, sampleMolten } from './fields.js';

export default {
  id: 'ember',
  name: 'Ember bloom',
  description: 'Warm molten cells slowly breathe',
  palette: 'ember',
  prepare: (input) => createFlowFrame(input, 9),
  sample: (x, y, z, frame, palette, color) => sampleMolten('ember', x, y, z, frame, palette, color),
};
