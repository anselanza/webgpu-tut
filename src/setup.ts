import { GRID_SIZE, SQUARE_VERTICES, WORKGROUP_SIZE } from "./defaults";

export const getVertexBuffer = (device: GPUDevice): GPUBuffer => {
  console.log(
    "vertices length:",
    SQUARE_VERTICES.byteLength,
    SQUARE_VERTICES.length
  );

  const vertexBuffer = device.createBuffer({
    label: "Cell vertices",
    size: SQUARE_VERTICES.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, SQUARE_VERTICES);

  return vertexBuffer;
};

export const getUniformBuffer = (device: GPUDevice): GPUBuffer => {
  // Create a uniform buffer that describes the grid.
  const uniformArray = new Uint32Array([GRID_SIZE, GRID_SIZE]);
  const uniformBuffer = device.createBuffer({
    label: "Grid Uniforms",
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
  return uniformBuffer;
};

export const getCellStateStorage = (device: GPUDevice): GPUBuffer[] => {
  // Create an array representing the active state of each cell.
  const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);

  // Create two storage buffers to hold the cell state.
  const cellStateStorage = [
    device.createBuffer({
      label: "Cell State A",
      size: cellStateArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
      label: "Cell State B",
      size: cellStateArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
  ];

  // Set each cell to a random state, then copy the JavaScript array
  // into the storage buffer.
  for (let i = 0; i < cellStateArray.length; ++i) {
    cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
  }
  device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

  return cellStateStorage;
};

export const getCellShaderModule = (device: GPUDevice) =>
  device.createShaderModule({
    label: "Cell shader",
    code: /* wgsl */ `

    struct VertexInput {
      @location(0) pos: vec2f,
      @builtin(instance_index) instance: u32
    }

    struct VertexOutput {
      @builtin(position) pos: vec4f,
      @location(0) cell: vec2f
    };

    @group(0) @binding(0) var<uniform> grid: vec2i;
    @group(0) @binding(1) var<storage> cellState: array<u32>;

    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {
     
      let i = f32(input.instance);
      let cell = vec2f(i % f32(grid.x), floor(i / f32(grid.x)));
      let state = f32(cellState[input.instance]);

      let cellOffset = cell / vec2f(grid) * 2;
      let gridPos = (input.pos * state + 1) / vec2f(grid) - 1 + cellOffset;

      // initialisation is a bit strange atm: https://github.com/gpuweb/gpuweb/issues/4210
      // var output: VertexOutput;
      let output = VertexOutput (vec4f(gridPos, 0, 1), cell); // structure built-in value constructor
      return output;

    }

    @fragment
    fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
      let c = input.cell / vec2f(grid);
      return vec4f(c, 1-c.x, 1); // (Red, Green, Blue, Alpha)
    }

  `,
  });

export const getComputeShaderModule = (device: GPUDevice) =>
  device.createShaderModule({
    label: "Game of Life simulation shader",
    code: /* wgsl */ `
    @group(0) @binding(0) var<uniform> grid: vec2i;

    @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
    @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

    @compute
    @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})

    fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
       // Determine how many active neighbors this cell has.
      let activeNeighbors = cellActive(cell.x+1, cell.y+1) +
        cellActive(cell.x+1, cell.y) +
        cellActive(cell.x+1, cell.y-1) +
        cellActive(cell.x, cell.y-1) +
        cellActive(cell.x-1, cell.y-1) +
        cellActive(cell.x-1, cell.y) +
        cellActive(cell.x-1, cell.y+1) +
        cellActive(cell.x, cell.y+1);    

        let i = cellIndex(cell.xy);

        // Conway's game of life rules:
        switch activeNeighbors {
          case 2: { // Active cells with 2 neighbors stay active.
            cellStateOut[i] = cellStateIn[i];
          }
          case 3: { // Cells with 3 neighbors become or stay active.
            cellStateOut[i] = 1;
          }
          default: { // Cells with < 2 or > 3 neighbors become inactive.
            cellStateOut[i] = 0;
          }
        }  
    }

    fn cellIndex(cell: vec2u) -> u32 {
      // Wraparound index for both axes
      return (cell.y % u32(grid.y)) * u32(grid.x) +
         (cell.x % u32(grid.x));
    }

    fn cellActive(x: u32, y: u32) -> u32 {
      return cellStateIn[cellIndex(vec2(x, y))];
    }
    
    `,
  });

export const getBindGroupLayout = (device: GPUDevice) =>
  device.createBindGroupLayout({
    label: "Cell Bind Group Layout",
    entries: [
      {
        binding: 0,
        visibility:
          GPUShaderStage.VERTEX |
          GPUShaderStage.COMPUTE |
          GPUShaderStage.FRAGMENT,
        buffer: {}, // Grid uniform buffer
      },
      {
        binding: 1,
        visibility:
          GPUShaderStage.VERTEX |
          GPUShaderStage.COMPUTE |
          GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" }, // Cell state input buffer
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" }, // Cell state output buffer
      },
    ],
  });

export const getBindGroups = (
  device: GPUDevice,
  bindGroupLayout: GPUBindGroupLayout,
  uniformBuffer: GPUBuffer,
  cellStateStorage: GPUBuffer[]
) => [
  device.createBindGroup({
    label: "Cell renderer bind group A",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellStateStorage[0] },
      },
      {
        binding: 2,
        resource: { buffer: cellStateStorage[1] },
      },
    ],
  }),
  device.createBindGroup({
    label: "Cell renderer bind group B",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellStateStorage[1] },
      },
      {
        binding: 2,
        resource: { buffer: cellStateStorage[0] },
      },
    ],
  }),
];

export const getPipelines = (
  device: GPUDevice,
  bindGroupLayout: GPUBindGroupLayout,
  cellShaderModule: GPUShaderModule,
  simulationShaderModule: GPUShaderModule,
  vertexBufferLayout: GPUVertexBufferLayout,
  canvasFormat: GPUTextureFormat
) => {
  const pipelineLayout = device.createPipelineLayout({
    label: "Cell Pipeline Layout",
    bindGroupLayouts: [bindGroupLayout],
  });

  const cellPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: pipelineLayout, // not "auto" any more
    vertex: {
      module: cellShaderModule,
      entryPoint: "vertexMain",
      buffers: [vertexBufferLayout],
    },
    fragment: {
      module: cellShaderModule,
      entryPoint: "fragmentMain",
      targets: [
        {
          format: canvasFormat,
        },
      ],
    },
  });

  // Create a compute pipeline that updates the game state.
  const simulationPipeline = device.createComputePipeline({
    label: "Simulation pipeline",
    layout: pipelineLayout,
    compute: {
      module: simulationShaderModule,
      entryPoint: "computeMain",
    },
  });

  return { cellPipeline, simulationPipeline };
};
