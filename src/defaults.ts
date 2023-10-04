export const GRID_SIZE = 256;
export const WORKGROUP_SIZE = 8;

export const UPDATE_INTERVAL = 32; // Update every 200ms (5 times/sec)

export const SQUARE_VERTICES = new Float32Array([
  -0.8,
  -0.8, // Triangle 1
  0.8,
  -0.8,
  0.8,
  0.8,

  -0.8,
  -0.8, // Triangle 2
  0.8,
  0.8,
  -0.8,
  0.8,
]);
