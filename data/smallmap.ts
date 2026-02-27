// Simple 10x10 all-walkable map using the same tileset as gentle.js
// Tile 271 = grass, -1 in objmap = walkable

export const tilesetpath = '/ai-town/assets/gentle-obj.png';
export const tiledim = 32;
export const screenxtiles = 10;
export const screenytiles = 10;
export const tilesetpxw = 1440;
export const tilesetpxh = 1024;

const W = 10;
const H = 10;
const GRASS = 271;

// Single background layer: all grass
const bgLayer: number[][] = [];
for (let x = 0; x < W; x++) {
  const col: number[] = [];
  for (let y = 0; y < H; y++) {
    col.push(GRASS);
  }
  bgLayer.push(col);
}
export const bgtiles = [bgLayer];

// Object layer: all -1 (walkable, no obstacles)
const objLayer: number[][] = [];
for (let x = 0; x < W; x++) {
  const col: number[] = [];
  for (let y = 0; y < H; y++) {
    col.push(-1);
  }
  objLayer.push(col);
}
export const objmap = [objLayer];

export const animatedsprites: never[] = [];

export const mapwidth = W;
export const mapheight = H;
