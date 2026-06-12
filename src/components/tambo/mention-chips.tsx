/**
 * Shared mention chip strip for chat inputs.
 *
 * Renders referenced items (e.g. dashboard panels) as colored pills above the
 * textarea. Chips are driven by state (context attachments), NOT by parsing the
 * textarea text, so the input stays purely the user's own words. Clicking a chip
 * removes it.
 */

import { cn } from "@/lib/utils";

export interface MentionChipItem {
  /** Removal handle (context attachment id). */
  id: string;
  /** Mention kind, drives chip color and badge (e.g. "panel"). */
  type: string;
  /** Human-readable label shown in the chip. */
  label: string;
}

/** Color mapping for mention types. */
function mentionColor(type: string): { bg: string; text: string; hover: string } {
  switch (type) {
    case "source":
      return { bg: "bg-portolan-cyan/10", text: "text-portolan-cyan", hover: "hover:bg-portolan-cyan/20" };
    case "layer":
      return { bg: "bg-primary/10", text: "text-primary", hover: "hover:bg-primary/20" };
    case "panel":
      return { bg: "bg-portolan-green/10", text: "text-portolan-green", hover: "hover:bg-portolan-green/20" };
    default:
      return { bg: "bg-muted", text: "text-foreground", hover: "hover:bg-muted/80" };
  }
}

/** Type label abbreviation for the chip badge. */
function typeLabel(type: string): string {
  switch (type) {
    case "source":
      return "S";
    case "layer":
      return "L";
    case "panel":
      return "P";
    default:
      return type[0]?.toUpperCase() ?? "?";
  }
}

interface MentionChipsProps {
  mentions: MentionChipItem[];
  onRemove: (id: string) => void;
  className?: string;
}

export function MentionChips({ mentions, onRemove, className }: MentionChipsProps) {
  if (mentions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1 px-3 pt-2 pb-1", className)}>
      {mentions.map((m) => {
        const color = mentionColor(m.type);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onRemove(m.id)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors",
              color.bg,
              color.text,
              color.hover,
            )}
            title={`Remove ${m.label}`}
          >
            <span>{typeLabel(m.type)}</span>
            <span className="truncate max-w-[160px]">{m.label}</span>
            <span className="text-[9px] opacity-60 ml-0.5">&times;</span>
          </button>
        );
      })}
    </div>
  );
}
