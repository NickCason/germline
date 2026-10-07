type Child = Node | string | number | null | undefined | false;
type Props = {
  class?: string;
  text?: string;
  style?: string;
  onclick?: (e: MouseEvent) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  attrs?: Record<string, string>;
};

/** Tiny element builder: h('button', { class: 'pill', onclick }, 'Start run'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.style) el.setAttribute('style', props.style);
  if (props.onclick) el.addEventListener('click', props.onclick as EventListener);
  if (props.disabled !== undefined && 'disabled' in el) (el as HTMLButtonElement).disabled = props.disabled;
  if (props.title) el.title = props.title;
  if (props.ariaLabel) el.setAttribute('aria-label', props.ariaLabel);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function toast(text: string): void {
  const el = h('div', { class: 'toast', text });
  document.body.append(el);
  setTimeout(() => el.remove(), 2300);
}

/** Full-screen dimmed layer for modal content; returns a closer. */
export function modal(parent: Element, ...content: Child[]): { el: HTMLDivElement; close: () => void } {
  const el = h('div', { class: 'scrim' }, ...content);
  parent.append(el);
  return { el, close: () => el.remove() };
}
