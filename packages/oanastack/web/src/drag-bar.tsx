import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

export function DragBar({
  label,
  value,
  min,
  max,
  unit,
  onChange,
  className = "drag-bar",
  style,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: "px" | "percent";
  onChange: (next: number) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const drag = useRef<{ x: number; start: number; width: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const host = unit === "percent" ? event.currentTarget.parentElement : null;
    drag.current = {
      x: event.clientX,
      start: value,
      width: host?.getBoundingClientRect().width || 1,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("dragging-split");
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    const next = unit === "px" ? state.start + dx : state.start + (dx / state.width) * 100;
    onChange(next);
  }

  function endDrag() {
    if (!drag.current) return;
    drag.current = null;
    document.body.classList.remove("dragging-split");
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = unit === "px" ? 16 : 2;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onChange(value - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onChange(value + step);
    }
  }

  return (
    <div
      className={className}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    />
  );
}
