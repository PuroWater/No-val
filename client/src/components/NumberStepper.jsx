function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

export default function NumberStepper({ value, min, max, step = 1, onChange, onCommit }) {
  const current = Number.isFinite(Number(value)) ? Number(value) : min;
  const stepUp = () => {
    const next = clamp(current + step, min, max);
    onChange(next);
    onCommit?.(next);
  };
  const stepDown = () => {
    const next = clamp(current - step, min, max);
    onChange(next);
    onCommit?.(next);
  };
  return (
    <div className="number-stepper">
      <input
        className="setting-number"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={() => onCommit?.(value)}
      />
      <div className="number-stepper-buttons">
        <button type="button" tabIndex={-1} disabled={current >= max} onClick={stepUp} aria-label="增加">▲</button>
        <button type="button" tabIndex={-1} disabled={current <= min} onClick={stepDown} aria-label="减少">▼</button>
      </div>
    </div>
  );
}
