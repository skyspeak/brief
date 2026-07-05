"use client";

export default function AccessKeyField({ value, onChange, onBlur, id = "access-key" }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        Access key
      </label>
      <input
        id={id}
        type="password"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="Paste your CRON_SECRET"
        autoComplete="off"
      />
      <span className="field-hint">
        Same value as <code>CRON_SECRET</code> in Vercel. Saved on this device only.
      </span>
    </div>
  );
}
