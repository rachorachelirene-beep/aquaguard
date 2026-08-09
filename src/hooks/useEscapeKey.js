import { useEffect } from "react";

export default function useEscapeKey(onEscape, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onEscape();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onEscape]);
}
