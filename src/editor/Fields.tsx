export function Field({
  label,
  value,
  onChange,
  multiline = false,
  hint,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  hint?: string;
  rows?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} />
      )}{" "}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export const toLines = (value: string) =>
  value === "" ? [] : value.split("\n");
