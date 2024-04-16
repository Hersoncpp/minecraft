import { Debugger } from "../lib/webglutils/Debugging.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import { blankCubeFSText, blankCubeVSText } from "./Shaders.js";
import { Vec4, Vec3 } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Cube } from "./Cube.js";
import { Chunk } from "./Chunk.js";
import Rand from "../lib/rand-seed/Rand.js";
export class Config {
}
Config.PlayerRadius = 0.4;
Config.PlayerHeight = 2.0;
Config.ChunkSize = 64.0;
Config.BorderChunks = 1.0; // no. of chunks to render around the current chunk
Config.CacheSize = Math.pow((2 * Config.BorderChunks + 1), 2); // No. of chunks to store in cache before resetting.
Config.Perlin_3D = false;
Config.Gravity = -9.8;
Config.Vjump = 10.0;
Config.DayTime = 60.0;
Config.NightCol = new Vec4([0.04313725, 0.00392157, 0.14901961, 1.0]);
Config.DayCol = new Vec4([0.6784314, 0.84705882, 0.90196078, 1.0]);
export class ChunkVectors {
}
ChunkVectors.SIZE = 500;
ChunkVectors.VERTICES = [];
export class MinecraftAnimation extends CanvasAnimation {
    constructor(canvas) {
        super(canvas);
        this.canvas2d = document.getElementById("textCanvas");
        this.ctx = Debugger.makeDebugContext(this.ctx);
        let gl = this.ctx;
        this.gui = new GUI(this.canvas2d, this);
        this.playerPosition = this.gui.getCamera().pos();
        this.Vvert = new Vec3();
        this.gTime = Date.now();
        this.frameTime = Date.now();
        // Generate initial landscape
        this.chunk = new Chunk(0.0, 0.0, 64);
        this.chunks = {};
        this.cache = {};
        this.blankCubeRenderPass = new RenderPass(gl, blankCubeVSText, blankCubeFSText);
        this.cubeGeometry = new Cube();
        this.initBlankCube();
        this.lightPosition = new Vec4([-1000, 1000, -1000, 1]);
        this.backgroundColor = new Vec4([0.0, 0.37254903, 0.37254903, 1.0]);
        // 3D perlin noise vectors:
        let seed = '40';
        let rng = new Rand(seed);
        let numVecs = ChunkVectors.SIZE;
        for (let i = 0; i < numVecs; i++) {
            let a = 2.0 * 3.1415926 * rng.next();
            let b = 2.0 * 3.1415926 * rng.next();
            let c = 2.0 * 3.1415926 * rng.next();
            let vec = new Vec3([Math.cos(a), Math.sin(b), Math.cos(c)]);
            vec.normalize();
            ChunkVectors.VERTICES.push(vec);
        }
    }
    chunkKey(x, z) {
        return `${Math.round(x)}_${Math.round(z)}`;
    }
    generateChunks() {
        let centerX = Math.floor((this.playerPosition.x + Config.ChunkSize / 2) / Config.ChunkSize) * Config.ChunkSize;
        let centerZ = Math.floor((this.playerPosition.z + Config.ChunkSize / 2) / Config.ChunkSize) * Config.ChunkSize;
        let xCoords = [];
        let zCoords = [];
        for (let i = -Config.BorderChunks; i <= Config.BorderChunks; ++i) {
            for (let j = -Config.BorderChunks; j <= Config.BorderChunks; ++j) {
                xCoords.push(centerX + Config.ChunkSize * i);
                zCoords.push(centerZ + Config.ChunkSize * j);
            }
        }
        let newChunks = {};
        for (let i = 0; i < Config.ChunkSize; ++i) {
            const key = this.chunkKey(xCoords[i], zCoords[i]);
            if (key in this.chunks) {
                newChunks[key] = this.chunks[key];
            }
            else if (key in this.cache) {
                newChunks[key] = this.cache[key];
            }
            else {
                newChunks[key] = new Chunk(xCoords[i], zCoords[i], Config.ChunkSize);
            }
            if (i == Math.floor(Config.CacheSize / 2)) {
                this.chunk = newChunks[key];
            }
        }
        // cache deleted chunks for hysteresis logic
        if (Object.keys(this.cache).length > Config.CacheSize) {
            this.cache = {};
        }
        for (let key in this.chunks) {
            if (!(key in newChunks)) {
                this.cache[key] = this.chunks[key];
            }
        }
        this.chunks = newChunks;
    }
    collisionChunks(cameraLocation) {
        let candidates = [];
        candidates.push(this.chunk);
        const center = this.chunk.getChunkCenter();
        const xMod = Math.abs(Math.abs(cameraLocation.x) % Config.ChunkSize - Config.ChunkSize / 2);
        const zMod = Math.abs(Math.abs(cameraLocation.z) % Config.ChunkSize - Config.ChunkSize / 2);
        if (xMod <= 2.0) {
            candidates.push(this.chunks[this.chunkKey(center.x + Config.ChunkSize, center.z)]);
            candidates.push(this.chunks[this.chunkKey(center.x - Config.ChunkSize, center.z)]);
        }
        if (zMod <= 2.0) {
            candidates.push(this.chunks[this.chunkKey(center.x, center.z + Config.ChunkSize)]);
            candidates.push(this.chunks[this.chunkKey(center.x, center.z - Config.ChunkSize)]);
        }
        if (xMod <= 2.0 && zMod <= 2.0) {
            candidates.push(this.chunks[this.chunkKey(center.x + Config.ChunkSize, center.z + Config.ChunkSize)]);
            candidates.push(this.chunks[this.chunkKey(center.x - Config.ChunkSize, center.z + Config.ChunkSize)]);
            candidates.push(this.chunks[this.chunkKey(center.x + Config.ChunkSize, center.z - Config.ChunkSize)]);
            candidates.push(this.chunks[this.chunkKey(center.x - Config.ChunkSize, center.z - Config.ChunkSize)]);
        }
        return candidates;
    }
    /**
     * Setup the simulation. This can be called again to reset the program.
     */
    reset() {
        this.gui.reset();
        this.playerPosition = this.gui.getCamera().pos();
    }
    /**
     * Sets up the blank cube drawing
     */
    initBlankCube() {
        this.blankCubeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
        this.blankCubeRenderPass.addAttribute("aVertPos", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.positionsFlat());
        this.blankCubeRenderPass.addAttribute("aNorm", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.normalsFlat());
        this.blankCubeRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.uvFlat());
        this.blankCubeRenderPass.addInstancedAttribute("aOffset", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        this.blankCubeRenderPass.addUniform("uLightPos", (gl, loc) => {
            gl.uniform4fv(loc, this.lightPosition.xyzw);
        });
        this.blankCubeRenderPass.addUniform("uProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
        });
        this.blankCubeRenderPass.addUniform("uView", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
        });
        this.blankCubeRenderPass.addUniform("uTime", (gl, loc) => {
            gl.uniform1f(loc, (Date.now() / 500.0) % (2 * Math.PI));
        });
        this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
        this.blankCubeRenderPass.setup();
    }
    /**
     * Draws a single frame
     *
     */
    draw() {
        //TODO: Logic for a rudimentary walking simulator. Check for collisions and reject attempts to walk into a cube. Handle gravity, jumping, and loading of new chunks when necessary.
        this.generateChunks();
        let position = new Vec3(this.playerPosition.xyz);
        let chunks = this.collisionChunks(this.playerPosition);
        position.add(this.gui.walkDir());
        if (!position.equals(this.playerPosition)) {
            let safe = true;
            for (let i = 0; i < chunks.length; i++) {
                if (chunks[i].sideCollision(position)) {
                    this.playerPosition.x = Math.round(this.playerPosition.x);
                    this.playerPosition.z = Math.round(this.playerPosition.z);
                    safe = false;
                    break;
                }
            }
            if (safe) {
                this.playerPosition = position;
            }
        }
        position = new Vec3(this.playerPosition.xyz);
        let velocity = new Vec3([
            0.0, Config.Gravity * (Date.now() - this.gTime) / 1000.0, 0.0
        ]);
        velocity.add(this.Vvert);
        velocity.scale((Date.now() - this.frameTime) / 1000.0);
        position.add(velocity);
        this.frameTime = Date.now();
        let safe = true;
        for (let i = 0; i < chunks.length; i++) {
            let height = chunks[i].verticalCollision(position, velocity.y > 0);
            if (height != Number.MIN_SAFE_INTEGER) {
                this.playerPosition.y = height + Config.PlayerHeight;
                this.onGround = true;
                this.Vvert = new Vec3();
                this.gTime = Date.now();
                safe = false;
                break;
            }
        }
        if (safe) {
            this.onGround = false;
            this.playerPosition = position;
        }
        this.gui.getCamera().setPos(this.playerPosition);
        let ellipseCenter = new Vec4([this.playerPosition.x, 0.0, this.playerPosition.z, 0.0]);
        let cycleTime = (Date.now() / ((Config.DayTime / 60.0) * 10000.0)) %
            (2 * Math.PI);
        let sinT = Math.sin(cycleTime);
        let cosT = Math.cos(cycleTime);
        let curveVector = new Vec4([1000.0 * sinT, 1000.0 * cosT, 1000.0 * sinT, 1.0]);
        this.lightPosition = Vec4.sum(ellipseCenter, curveVector);
        let heightPercent = Math.max((this.lightPosition.y + 500.0) / 1500.0, 0.0);
        this.backgroundColor = Vec4.sum(Config.NightCol, Vec4.difference(Config.DayCol, Config.NightCol)
            .scale(heightPercent));
        this.backgroundColor.w = 1.0;
        // Drawing
        const gl = this.ctx;
        const bg = this.backgroundColor;
        gl.clearColor(bg.r, bg.g, bg.b, bg.a);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.frontFace(gl.CCW);
        gl.cullFace(gl.BACK);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is the default frame buffer
        this.drawScene(0, 0, 1280, 960);
    }
    drawScene(x, y, width, height) {
        const gl = this.ctx;
        gl.viewport(x, y, width, height);
        //TODO: Render multiple chunks around the player, using Perlin noise shaders
        for (let chunk in this.chunks) {
            this.blankCubeRenderPass.updateAttributeBuffer('aOffset', this.chunks[chunk].cubePositions());
            this.blankCubeRenderPass.drawInstanced(this.chunks[chunk].numCubes());
        }
    }
    getGUI() {
        return this.gui;
    }
    jump() {
        //TODO: If the player is not already in the lair, launch them upwards at 10 units/sec.
        if (this.onGround) {
            this.Vvert = new Vec3([0.0, Config.Vjump, 0.0]);
        }
    }
}
export function initializeCanvas() {
    const canvas = document.getElementById("glCanvas");
    /* Start drawing */
    const canvasAnimation = new MinecraftAnimation(canvas);
    canvasAnimation.start();
}
//# sourceMappingURL=App.js.map