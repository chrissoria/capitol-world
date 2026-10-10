// Small helpers for building the panel without a framework.

export type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  add(node, ...children);
  return node;
}

export function add(target: Element, ...children: Child[]) {
  for (const child of children) if (child) target.append(child);
}

export function put(target: Element, ...children: Child[]) {
  target.replaceChildren();
  add(target, ...children);
}

export function niceDate(day: string): string {
  if (!day) return "";
  return new Date(`${day.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
