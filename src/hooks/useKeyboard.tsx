import { useEffect, useCallback } from "react";

interface KeyDownEvent extends KeyboardEvent {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  preventDefault: () => void;
}

function useKeyCombo(keyCombo: string, callback: () => void) {
  const handleKeyDown = useCallback(
    (event: KeyDownEvent) => {
      const keys = keyCombo.toLowerCase().split("+");
      const ctrlRequired = keys.includes("ctrl");
      const shiftRequired = keys.includes("shift");
      const altRequired = keys.includes("alt");
      const metaRequired = keys.includes("meta");

      const key = keys[keys.length - 1];

      if (
        ctrlRequired === event.ctrlKey &&
        shiftRequired === event.shiftKey &&
        altRequired === event.altKey &&
        metaRequired === event.metaKey &&
        event.key.toLowerCase() === key
      ) {
        event.preventDefault();
        callback();
      }
    },
    [keyCombo, callback]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export default useKeyCombo;
