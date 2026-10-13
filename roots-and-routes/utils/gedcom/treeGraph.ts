// Data layer of the graphical tree: GEDCOM file -> input of `relatives-tree` -> positions of cards and connectors.
// Pure functions, no Vue, so they can be tested on real data with `npx jiti`.
import calcTree from 'relatives-tree'
import type { GedcomFile, GedcomIndividual } from '~~/types/gedcom'

// ---- Geometry. The library places every card in a cell of 2 x 2 "units"; the card sits in the middle of its cell.
// Connectors run from cell centers and bends lie on cell borders, so the cell padding is the visible length of the stubs.
export const CARD_WIDTH = 200
export const CARD_HEIGHT = 76
export const PAD_X = 12
export const PAD_Y = 30
export const UNIT_X = (CARD_WIDTH + 2 * PAD_X) / 2
export const UNIT_Y = (CARD_HEIGHT + 2 * PAD_Y) / 2

export type TreeGender = 'male' | 'female'
export type TreeRelType = 'blood' | 'married' | 'divorced' | 'adopted' | 'half'
export interface TreeRelation { id: string; type: TreeRelType }
export interface TreeNode {
  id: string
  gender: TreeGender
  parents: TreeRelation[]
  children: TreeRelation[]
  siblings: TreeRelation[]
  spouses: TreeRelation[]
}

/** Prefix of the ids of invented "unknown partner" nodes; they are not in the GEDCOM file */
export const UNKNOWN_PREFIX = 'unknown-'
export const isUnknownPartner = (id: string): boolean => id.startsWith(UNKNOWN_PREFIX)

export interface BuiltTree {
  nodes: TreeNode[]
  /** People whose sex is unknown and could not be derived from their role in a family */
  unknownSex: Set<string>
  warnings: string[]
}

/** Name for display: GEDCOM writes the surname between slashes ("Jan /Mikulik/"); empty names become "?" */
export function displayName(person: Pick<GedcomIndividual, 'names'>): string {
  const name = person.names[0]
  const text = (name?.full || [name?.given, name?.surname].filter(Boolean).join(' ')).replace(/\//g, ' ').replace(/\s+/g, ' ').trim()
  return text || '?'
}

const addRelation = (list: TreeRelation[], id: string, type: TreeRelType) => {
  if (!list.some(relation => relation.id === id)) list.push({ id, type })
}

export function buildTreeNodes(file: GedcomFile): BuiltTree {
  const warnings: string[] = []
  const unknownSex = new Set<string>()
  const roleGender = new Map<string, TreeGender>()
  const known = (id?: string): id is string => !!id && file.individuals.has(id)

  for (const family of file.families.values()) {
    if (known(family.husband) && !roleGender.has(family.husband)) roleGender.set(family.husband, 'male')
    if (known(family.wife) && !roleGender.has(family.wife)) roleGender.set(family.wife, 'female')
  }

  const nodes = new Map<string, TreeNode>()
  for (const [id, person] of file.individuals) {
    let gender: TreeGender
    if (person.sex === 'M') gender = 'male'
    else if (person.sex === 'F') gender = 'female'
    else {
      const fromRole = roleGender.get(id)
      gender = fromRole ?? 'male'
      if (!fromRole) unknownSex.add(id)
    }
    nodes.set(id, { id, gender, parents: [], children: [], siblings: [], spouses: [] })
  }

  for (const family of file.families.values()) {
    const parents = [family.husband, family.wife].filter(known)
    const children = family.children.filter(known)
    for (const childId of children) {
      for (const parentId of parents) {
        if (parentId === childId) continue
        addRelation(nodes.get(childId)!.parents, parentId, 'blood')
        addRelation(nodes.get(parentId)!.children, childId, 'blood')
      }
    }
    if (known(family.husband) && known(family.wife) && family.husband !== family.wife) {
      const type: TreeRelType = family.divorce ? 'divorced' : 'married'
      addRelation(nodes.get(family.husband)!.spouses, family.wife, type)
      addRelation(nodes.get(family.wife)!.spouses, family.husband, type)
    }
  }

  addUnknownPartners(file, nodes)
  removeParentCycles(nodes, warnings)

  // Siblings are the other children of the same parents; sharing all parents makes them full siblings, otherwise half
  for (const node of nodes.values()) {
    const parentIds = new Set(node.parents.map(parent => parent.id))
    for (const parent of node.parents) {
      for (const child of nodes.get(parent.id)!.children) {
        if (child.id === node.id) continue
        const otherParents = nodes.get(child.id)!.parents
        const sameParents = otherParents.length === parentIds.size && otherParents.every(other => parentIds.has(other.id))
        addRelation(node.siblings, child.id, sameParents ? 'blood' : 'half')
      }
    }
  }

  return { nodes: [...nodes.values()], unknownSex, warnings }
}

// The library shows the children of a *couple*. A child with only one known parent would vanish from that parent's view
// as soon as the parent has another partner, so such a family gets an invented partner (an empty "unknown" card).
function addUnknownPartners(file: GedcomFile, nodes: Map<string, TreeNode>) {
  const families = new Map<string, number>()
  for (const family of file.families.values()) {
    for (const id of [family.husband, family.wife]) if (id && nodes.has(id)) families.set(id, (families.get(id) ?? 0) + 1)
  }
  for (const family of file.families.values()) {
    const parents = [family.husband, family.wife].filter((id): id is string => !!id && nodes.has(id))
    const children = family.children.filter(id => nodes.has(id) && !parents.includes(id))
    if (parents.length !== 1 || !children.length || (families.get(parents[0]!) ?? 0) < 2) continue
    const parent = nodes.get(parents[0]!)!
    const id = `${UNKNOWN_PREFIX}${family.xrefId}`
    nodes.set(id, {
      id,
      gender: parent.gender === 'male' ? 'female' : 'male',
      parents: [],
      children: children.map(childId => ({ id: childId, type: 'blood' as const })),
      siblings: [],
      spouses: [{ id: parent.id, type: 'married' }],
    })
    addRelation(parent.spouses, id, 'married')
    for (const childId of children) addRelation(nodes.get(childId)!.parents, id, 'blood')
  }
}

// A person who is their own ancestor (bad data) would make the layout recurse forever: drop the back edge that closes the loop
function removeParentCycles(nodes: Map<string, TreeNode>, warnings: string[]) {
  const state = new Map<string, 'open' | 'done'>()
  const visit = (id: string) => {
    state.set(id, 'open')
    for (const child of [...nodes.get(id)!.children]) {
      if (state.get(child.id) === 'open') {
        nodes.get(id)!.children = nodes.get(id)!.children.filter(relation => relation.id !== child.id)
        const childNode = nodes.get(child.id)!
        childNode.parents = childNode.parents.filter(relation => relation.id !== id)
        warnings.push(`${child.id} is listed as their own ancestor; the link ${id} -> ${child.id} was ignored`)
      } else if (!state.has(child.id)) {
        visit(child.id)
      }
    }
    state.set(id, 'done')
  }
  for (const id of nodes.keys()) if (!state.has(id)) visit(id)
}

/**
 * Keeps at most `maxGenerations` generations (the root counts as the first) of ancestors and of descendants, plus the
 * spouses and siblings of everyone kept. Returns the input unchanged when nothing lies beyond the limit.
 */
export function limitGenerations(nodes: readonly TreeNode[], rootId: string, maxGenerations: number): readonly TreeNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]))
  if (!byId.has(rootId)) return nodes
  const reach = (next: (node: TreeNode) => TreeRelation[]) => {
    const depth = new Map<string, number>([[rootId, 0]])
    const queue = [rootId]
    while (queue.length) {
      const id = queue.shift()!
      for (const relation of next(byId.get(id)!)) {
        if (!depth.has(relation.id) && byId.has(relation.id)) {
          depth.set(relation.id, depth.get(id)! + 1)
          queue.push(relation.id)
        }
      }
    }
    return depth
  }
  const ancestors = reach(node => node.parents)
  const descendants = reach(node => node.children)
  const limit = Math.max(1, Math.floor(maxGenerations)) - 1
  const tooFar = [...ancestors.values(), ...descendants.values()].some(depth => depth > limit)
  if (!tooFar) return nodes

  const kept = new Set<string>([rootId])
  for (const depths of [ancestors, descendants]) for (const [id, depth] of depths) if (depth <= limit) kept.add(id)
  for (const id of [...kept]) {
    for (const relation of [...byId.get(id)!.spouses, ...byId.get(id)!.siblings]) kept.add(relation.id)
  }
  const keep = (relations: TreeRelation[]) => relations.filter(relation => kept.has(relation.id))
  return nodes
    .filter(node => kept.has(node.id))
    .map(node => ({ ...node, parents: keep(node.parents), children: keep(node.children), siblings: keep(node.siblings), spouses: keep(node.spouses) }))
}

export interface LayoutNode { id: string; left: number; top: number; hasSubTree: boolean }
/** `x`, `y`: pixel position of the wedding badge. `adjacent` is false when the library placed the partners apart. */
export interface LayoutCouple { key: string; x: number; y: number; divorced: boolean; adjacent: boolean }
export interface TreeLayout {
  nodes: LayoutNode[]
  /** Segments [x1, y1, x2, y2] in library units */
  connectors: ReadonlyArray<readonly [number, number, number, number]>
  /** Size of the drawing in library units */
  canvas: { width: number; height: number }
  couples: LayoutCouple[]
}

/** Unit coordinates (left, top) of a card -> pixels of its top-left corner in the drawing */
export const cardX = (left: number): number => left * UNIT_X + PAD_X
export const cardY = (top: number): number => top * UNIT_Y + PAD_Y

export function computeLayout(nodes: readonly TreeNode[], rootId: string, maxGenerations = 10): TreeLayout {
  const limited = limitGenerations(nodes, rootId, maxGenerations)
  // The library's own types use `const enum`s, which cannot be named from our code; the shapes are identical
  const tree = calcTree(limited as unknown as Parameters<typeof calcTree>[0], { rootId })

  const placed = new Map(tree.nodes.map(node => [node.id, node]))
  const couples = new Map<string, LayoutCouple>()
  for (const node of tree.nodes) {
    for (const spouse of node.spouses) {
      const other = placed.get(spouse.id)
      // Partners in the same row get a wedding badge. Next to each other it sits between them. With several marriages the
      // library sometimes parks the second partner at the edge of a group of siblings; then the badge sits on the right
      // border of the left card, where the long connector to the other partner starts.
      if (!other || other.top !== node.top) continue
      const key = [node.id, other.id].sort().join('|')
      if (couples.has(key)) continue
      const left = Math.min(node.left, other.left)
      const adjacent = Math.abs(other.left - node.left) === 2
      couples.set(key, { key, x: (left + 2) * UNIT_X, y: cardY(node.top), divorced: String(spouse.type) === 'divorced', adjacent })
    }
  }

  return {
    nodes: tree.nodes.map(node => ({ id: node.id, left: node.left, top: node.top, hasSubTree: node.hasSubTree })),
    connectors: tree.connectors,
    canvas: { width: tree.canvas.width, height: tree.canvas.height },
    couples: [...couples.values()],
  }
}
