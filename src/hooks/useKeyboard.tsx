import { useEffect, useRef } from 'react';
export interface KeyboardOptions {
  enabled?: boolean;
  target?: Window | Document | HTMLElement | null;
  /** Defaults to true to preserve the legacy two-argument API. */
  allowInEditable?: boolean;
  allowRepeat?: boolean;
  preventDefault?: boolean;
}
/** Composition events never trigger shortcuts. Options retain legacy defaults. */
export default function useKeyCombo(
  keyCombo: string,
  callback: () => void,
  options: KeyboardOptions = {}
) {
  const latest = useRef({ callback, options });
  latest.current = { callback, options };
  const { enabled = true, target } = options;
  useEffect(() => {
    const node =
      target === undefined
        ? typeof window === 'undefined'
          ? null
          : window
        : target;
    if (!enabled || !node) return;
    const keys = keyCombo
      .toLowerCase()
      .split('+')
      .map(key => key.trim());
    const handle = (raw: Event) => {
      const event = raw as KeyboardEvent;
      const { callback, options } = latest.current;
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        (options.allowRepeat === false && event.repeat)
      )
        return;
      if (
        options.allowInEditable === false &&
        event.composedPath().some(node => {
          const element = node as HTMLElement;
          return (
            element.nodeType === 1 &&
            (element.matches('input,textarea,select') ||
              element.isContentEditable ||
              element.closest(
                '[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]'
              ))
          );
        })
      )
        return;
      if (
        keys.includes('ctrl') !== event.ctrlKey ||
        keys.includes('shift') !== event.shiftKey ||
        keys.includes('alt') !== event.altKey ||
        keys.includes('meta') !== event.metaKey ||
        event.key.toLowerCase() !== keys[keys.length - 1]
      )
        return;
      if (options.preventDefault !== false) event.preventDefault();
      callback();
    };
    node.addEventListener('keydown', handle);
    return () => node.removeEventListener('keydown', handle);
  }, [keyCombo, enabled, target]);
}
