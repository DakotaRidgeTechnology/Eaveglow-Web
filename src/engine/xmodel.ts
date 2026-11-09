// Reads an xLights custom model (.xmodel), which prop makers publish for
// their props: where each node sits, in wiring order.
export interface PropModel {
  name: string;
  width: number;
  height: number;
  /** [column, row] of node 1, 2, 3… (row 0 is the top). */
  nodes: [number, number][];
}

const attr = (text: string, name: string) => text.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

export function parseXModel(text: string): PropModel {
  if (!/<custommodel\b/i.test(text)) throw new Error("That file isn't an xLights custom model (.xmodel).");
  const byNode = new Map<number, [number, number]>();
  const compressed = attr(text, 'CustomModelCompressed');
  if (compressed) {
    // "node,row,col[,layer];…"
    for (const entry of compressed.split(';')) {
      const [node, row, col] = entry.split(',').map(Number);
      if (node > 0 && row >= 0 && col >= 0) byNode.set(node, [col, row]);
    }
  } else {
    // Rows split by ";", cells by ","; a cell holds its node number. Only the first layer ("|").
    const grid = (attr(text, 'CustomModel') ?? '').split('|')[0];
    grid.split(';').forEach((line, row) =>
      line.split(',').forEach((cell, col) => {
        const node = parseInt(cell, 10);
        if (node > 0) byNode.set(node, [col, row]);
      }),
    );
  }
  const count = Math.max(0, ...byNode.keys());
  if (!count) throw new Error("That model doesn't list any lights.");
  const nodes: [number, number][] = [];
  for (let n = 1; n <= count; n++) {
    const at = byNode.get(n);
    if (!at) throw new Error(`That model skips light ${n}, so Eaveglow can't tell how it's wired.`);
    nodes.push(at);
  }
  const width = Math.max(Number(attr(text, 'parm1')) || 0, ...nodes.map(([c]) => c + 1));
  const height = Math.max(Number(attr(text, 'parm2')) || 0, ...nodes.map(([, r]) => r + 1));
  return { name: attr(text, 'name')?.trim() || 'Prop', width, height, nodes };
}
