import type { ReactNode } from "react";
import { Badge } from "@/components/arc/badge/badge";
import { Progress } from "@/components/arc/progress/progress";
import styles from "./ui.module.css";

// Pieces shared by every shell screen, so the screens look like one product.

export function PageHeader({
  eyebrow,
  eyebrowIcon,
  title,
  meta,
  actions,
}: {
  eyebrow?: string;
  // Shown before the eyebrow text, for example a subject's icon.
  eyebrowIcon?: ReactNode;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.pageHead}>
      <div className={styles.pageHeadText}>
        {eyebrow && (
          <p className={styles.eyebrow}>
            {eyebrowIcon}
            {eyebrow}
          </p>
        )}
        <h1 className={styles.pageTitle}>{title}</h1>
        {meta && <div className={styles.pageMeta}>{meta}</div>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}

// A titled block: the title row on top, the content under it.
export function Block({
  title,
  note,
  actions,
  children,
  id,
  className,
}: {
  title: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section
      className={className ? `${styles.block} ${className}` : styles.block}
      aria-labelledby={titleId}
    >
      <header className={styles.blockHead}>
        <h2 id={titleId} className={styles.blockTitle}>
          {title}
        </h2>
        {note && <span className={styles.blockNote}>{note}</span>}
        {actions && <div className={styles.blockActions}>{actions}</div>}
      </header>
      {children}
    </section>
  );
}

// A small stat: a label over a value, on a raised tile.
export function Stat({
  label,
  value,
  suffix,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  size?: "md" | "lg";
}) {
  return (
    <div className={size === "lg" ? `${styles.stat} ${styles.statLarge}` : styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>
        {value}
        {suffix && <span className={styles.statSuffix}>{suffix}</span>}
      </span>
    </div>
  );
}

export type ChapterStatus = "done" | "in_progress" | "not_started" | "no_progress";

const STATUS_LABEL: Record<ChapterStatus, string> = {
  done: "完了",
  in_progress: "進行中",
  not_started: "未着手",
  // A chapter with nothing to count, such as one of lessons only. It is not a "not started" chapter.
  no_progress: "記録なし",
};

const STATUS_TONE: Record<ChapterStatus, "success" | "info" | "neutral"> = {
  done: "success",
  in_progress: "info",
  not_started: "neutral",
  no_progress: "neutral",
};

export function StatusBadge({ status }: { status: ChapterStatus }) {
  return (
    <Badge size="sm" tone={STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// A progress bar with its own percent on the right, for rows and tiles.
export function Bar({ percent }: { percent: number }) {
  return <Progress value={percent} showValue />;
}

// A loading or error line for a screen that waits on the API.
export function Notice({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "error";
}) {
  return <p className={tone === "error" ? styles.errorNotice : styles.mutedNotice}>{children}</p>;
}
