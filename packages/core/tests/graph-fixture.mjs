/** Small named fixtures for scheduler tests; production linking uses explicit object maps. */
export function graph(root, definitions = []) {
  const nodes = [root, ...definitions].map((definition) => ({ definition, imports: new Map() }));
  for (const node of nodes) {
    for (const target of nodes) node.imports.set(target.definition.name, target);
  }
  return nodes[0];
}
