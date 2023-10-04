const GRID_SIZE = 32;

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
} else {
  console.info("WebGPU all good here!");
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();
console.log("Got the device!", device);

const canvas = document.querySelector("canvas");

const context = canvas.getContext("webgpu");
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

// Create a uniform buffer that describes the grid.
const uniformArray = new Uint32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

// Vertices for square
const vertices = new Float32Array([
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

console.log("vertices length:", vertices.byteLength, vertices.length);

const vertexBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);

const vertexBufferLayout = {
  arrayStride: 8,
  attributes: [
    {
      format: "float32x2",
      offset: 0,
      shaderLocation: 0, // Position, see vertex shader
    },
  ],
};

const cellShaderModule = device.createShaderModule({
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

    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {
     
      let i = f32(input.instance);
      let cell = vec2f(i % f32(grid.x), floor(i / f32(grid.x)));
      let cellOffset = cell / vec2f(grid) * 2;
      let gridPos = (input.pos + 1) / vec2f(grid) - 1 + cellOffset;

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

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: "auto",
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

// Bind group needs uniform buffer AND render pipeline
const bindGroup = device.createBindGroup({
  label: "Cell renderer bind group",
  layout: cellPipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: { buffer: uniformBuffer },
    },
  ],
});

context.configure({
  device,
  format: canvasFormat,
});

const encoder = device.createCommandEncoder();

const pass = encoder.beginRenderPass({
  colorAttachments: [
    {
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0.3, a: 1 },
      loadOp: "clear",
      storeOp: "store",
    },
  ],
});

pass.setPipeline(cellPipeline);
pass.setVertexBuffer(0, vertexBuffer);
pass.setBindGroup(0, bindGroup);
pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 6 vertices with two values (x,y) each, instance count

pass.end();

// const commandBuffer = encoder.finish(); // can't reuse the commandBuffer anyway
device.queue.submit([encoder.finish()]);
