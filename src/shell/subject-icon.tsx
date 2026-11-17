import {
  Atom,
  BookOpen,
  BookOpenText,
  Binary,
  Calculator,
  Clapperboard,
  CookingPot,
  Compass,
  Dumbbell,
  Earth,
  FlaskConical,
  Gamepad2,
  HeartPulse,
  Landmark,
  Languages,
  Map,
  Microscope,
  Monitor,
  Music,
  Palette,
  Scale,
  ScrollText,
  Smartphone,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { subjectIconKey, type SubjectIconKey } from "@/lib/subject-icon";
import styles from "./subject-icon.module.css";

// The icon for each subject key. The names come from lucide-react; the key rules live in
// src/lib/subject-icon.ts.
const ICONS: Record<SubjectIconKey, LucideIcon> = {
  inquiry: Compass,
  activities: UsersRound,
  monitor: Monitor,
  smartphone: Smartphone,
  game: Gamepad2,
  video: Clapperboard,
  music: Music,
  english: Languages,
  health: HeartPulse,
  pe: Dumbbell,
  home: CookingPot,
  art: Palette,
  geography: Map,
  history: ScrollText,
  economics: Scale,
  civics: Landmark,
  physics: Atom,
  chemistry: FlaskConical,
  biology: Microscope,
  "earth-science": Earth,
  information: Binary,
  math: Calculator,
  japanese: BookOpenText,
  science: Atom,
  default: BookOpen,
};

// A subject's icon on a small tile. It sits beside the subject name, so it is decorative.
export function SubjectIcon({ subject, size = "md" }: { subject: string; size?: "sm" | "md" }) {
  const Icon = ICONS[subjectIconKey(subject)];
  const small = size === "sm";
  return (
    <span className={small ? styles.small : styles.tile} aria-hidden="true">
      <Icon size={small ? 14 : 18} />
    </span>
  );
}
