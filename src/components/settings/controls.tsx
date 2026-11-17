import type { ReactNode } from "react";
import { Input } from "@/components/arc/input/input";
import styles from "./settings.module.css";

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

// One setting: label and description on the left, the control on the right.
export function SettingRow({
  label,
  description,
  children,
  wide,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? `${styles.row} ${styles.rowWide}` : styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        {description && <div className={styles.rowDescription}>{description}</div>}
      </div>
      <div className={wide ? `${styles.rowControl} ${styles.wideControl}` : styles.rowControl}>
        {children}
      </div>
    </div>
  );
}

// Records the next key press as the hotkey. Escape and Tab are left alone so the user
// can still leave the field with the keyboard.
export function HotkeyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <Input
      label={label}
      readOnly
      value={value}
      className={styles.hotkeyInput}
      onKeyDown={(event) => {
        if (event.key === "Tab" || event.key === "Escape") return;
        event.preventDefault();
        onChange(event.key);
      }}
    />
  );
}
