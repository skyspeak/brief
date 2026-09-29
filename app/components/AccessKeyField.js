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
        placeholder="Paste your ACCESS_KEY"
        autoComplete="off"
      />
      <span className="field-hint">
        Long-lived <code>ACCESS_KEY</code> from Vercel (or <code>CRON_SECRET</code> if you
        haven&apos;t set one). It does not expire — saved on this device only.
      </span>
    </div>
  );
}
