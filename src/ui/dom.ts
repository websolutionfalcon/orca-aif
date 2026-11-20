// A tiny virtual tree: views return plain data (testable in Node without a DOM) and `render`
// turns it into real nodes. Text always goes through text nodes, never innerHTML.

export interface VNode {
  tag: string
  attrs: Record<string, string>
  on: Record<string, (event: Event) => void>
  children: (VNode | string)[]
}

export interface Props {
  class?: string
  attrs?: Record<string, string | number | boolean | null | undefined>
  on?: Record<string, (event: Event) => void>
}

type Child = VNode | string | number | null | undefined | false | Child[]

function flatten(children: Child[], into: (VNode | string)[]): (VNode | string)[] {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    if (Array.isArray(child)) flatten(child, into)
    else into.push(typeof child === 'number' ? String(child) : child)
  }
  return into
}

export function h(tag: string, props: Props | null, ...children: Child[]): VNode {
  const attrs: Record<string, string> = {}
  if (props?.class) attrs.class = props.class
  for (const [name, value] of Object.entries(props?.attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue
    attrs[name] = value === true ? '' : String(value)
  }
  return { tag, attrs, on: props?.on ?? {}, children: flatten(children, []) }
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** `inSvg` is set for children of an `<svg>`: they need the SVG namespace to draw. */
export function render(node: VNode | string, doc: Document, inSvg = false): Node {
  if (typeof node === 'string') return doc.createTextNode(node)
  const svg = inSvg || node.tag === 'svg'
  const element = svg ? doc.createElementNS(SVG_NS, node.tag) : doc.createElement(node.tag)
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name === 'value' && 'value' in element) (element as HTMLInputElement).value = value
    // Through CSSOM: a frame's CSP may refuse inline style attributes, never element.style.
    else if (name === 'style') (element as HTMLElement).style.cssText = value
    else element.setAttribute(name, value)
  }
  for (const [event, handler] of Object.entries(node.on)) element.addEventListener(event, handler)
  for (const child of node.children) element.appendChild(render(child, doc, svg))
  return element
}

/** All text of a tree, children joined by spaces (tests and summaries). */
export function textOf(node: VNode | string): string {
  if (typeof node === 'string') return node
  return node.children.map(textOf).filter(Boolean).join(' ')
}

export function findAll(node: VNode | string, match: (node: VNode) => boolean, found: VNode[] = []): VNode[] {
  if (typeof node === 'string') return found
  if (match(node)) found.push(node)
  for (const child of node.children) findAll(child, match, found)
  return found
}

export const byClass = (name: string) => (node: VNode): boolean => (node.attrs.class ?? '').split(' ').includes(name)
export const byKey = (key: string) => (node: VNode): boolean => node.attrs['data-key'] === key
