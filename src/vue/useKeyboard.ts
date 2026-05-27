import { onMounted, onUnmounted } from 'vue';

export default function useKeyboard(keyCombo: string, callback: () => void) {
  const handleKeyDown = (event: KeyboardEvent) => {
    const keys = keyCombo.toLowerCase().split('+');
    const ctrlRequired = keys.includes('ctrl');
    const shiftRequired = keys.includes('shift');
    const altRequired = keys.includes('alt');
    const metaRequired = keys.includes('meta');
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
  };

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
}
