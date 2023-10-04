import {
  GRID_SIZE,
  SQUARE_VERTICES,
  UPDATE_INTERVAL,
  WORKGROUP_SIZE,
} from "./defaults";
import {
  getUniformBuffer,
  getVertexBuffer,
  getCellStateStorage,
  getCellShaderModule,
  getComputeShaderModule,
  getBindGroupLayout,
  getBindGroups,
  getPipelines,
} from "./setup";

export {}; // allows top-level await; is this the only way?

const updateGrid = (
  stepIn: number,
  device: GPUDevice,
  context: GPUCanvasContext,
  simulationPipeline: GPUComputePipeline,
  bindGroups: GPUBindGroup[],
  cellPipeline: GPURenderPipeline,
  vertexBuffer: GPUBuffer,
  vertexLength: number
): number => {
  let step = stepIn;

  const encoder = device.createCommandEncoder();
  const computePass = encoder.beginComputePass();

  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, bindGroups[step % 2]);

  const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
  computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

  computePass.end();

  step++; // Increment the step count

  // Start a render pass
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
        storeOp: "store",
      },
    ],
  });

  // Draw the grid.
  pass.setPipeline(cellPipeline);
  pass.setBindGroup(0, bindGroups[step % 2]);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertexLength / 2, GRID_SIZE * GRID_SIZE);

  // End the render pass and submit the command buffer
  pass.end();
  device.queue.submit([encoder.finish()]);

  return step;
};

const main = async () => {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
  }

  const device = await adapter.requestDevice();
  console.log("Got the device!", device);

  const canvas = document.querySelector("canvas");

  const context = canvas?.getContext("webgpu");

  // uniform buffer is for the grid layout
  const uniformBuffer = getUniformBuffer(device);
  // vertext buffer is only for drawing/rendering
  const vertexBuffer = getVertexBuffer(device);
  // cell state storage buffers (ping-pong, so two) for rendering and compute
  const cellStateStorage = getCellStateStorage(device);

  const cellShaderModule = getCellShaderModule(device);
  const simulationShaderModule = getComputeShaderModule(device);

  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 8,
    attributes: [
      {
        format: "float32x2",
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
      },
    ],
  };

  // Create the bind group layout and pipeline layout.
  const bindGroupLayout = getBindGroupLayout(device);

  const bindGroups = getBindGroups(
    device,
    bindGroupLayout,
    uniformBuffer,
    cellStateStorage
  );

  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

  const { simulationPipeline, cellPipeline } = getPipelines(
    device,
    bindGroupLayout,
    cellShaderModule,
    simulationShaderModule,
    vertexBufferLayout,
    canvasFormat
  );

  if (context) {
    context.configure({
      device,
      format: canvasFormat,
    });

    let step = 0;

    // Schedule updateGrid() to run repeatedly
    setInterval(() => {
      step = updateGrid(
        step,
        device,
        context,
        simulationPipeline,
        bindGroups,
        cellPipeline,
        vertexBuffer,
        SQUARE_VERTICES.length
      );
    }, UPDATE_INTERVAL);
  }
};

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
} else {
  console.info("WebGPU all good here!");
  main();
}
