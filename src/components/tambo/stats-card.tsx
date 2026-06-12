import {
  AlertTriangle,
  BarChart3,
  Building2,
  Compass,
  Droplets,
  Globe,
  Mountain,
  Thermometer,
  Users,
  Wind,
} from "lucide-react";
import * as React from "react";
import { z } from "zod";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { cn } from "@/lib/utils";

export const statsCardSchema = z.object({
  title: z.string().describe("Metric name or label"),
  value: z.string().describe("Formatted metric value (e.g. '28.5°C', '1.2M', '45%')"),
  subtitle: z.string().optional().describe("Additional context like unit or source"),
  change: z.number().optional().describe("Percentage change from baseline or previous period"),
  trend: z.enum(["up", "down", "flat"]).optional().describe("Direction of the trend"),
  icon: z
    .enum(["thermometer", "wind", "mountain", "building", "users", "droplets", "compass", "globe", "alert", "chart"])
    .optional()
    .describe("Icon to display"),
  color: z
    .enum(["blue", "green", "orange", "red", "purple", "cyan", "amber"])
    .optional()
    .describe("Accent color theme"),
});

type StatsCardProps = z.infer<typeof statsCardSchema>;

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  thermometer: Thermometer,
  wind: Wind,
  mountain: Mountain,
  building: Building2,
  users: Users,
  droplets: Droplets,
  compass: Compass,
  globe: Globe,
  alert: AlertTriangle,
  chart: BarChart3,
};

const COLOR_CLASSES: Record<string, string> = {
  blue: "from-portolan-blue/10 to-portolan-blue/5 border-portolan-blue/20",
  green: "from-success/10 to-success/5 border-success/20",
  orange: "from-secondary/10 to-secondary/5 border-secondary/20",
  red: "from-destructive/10 to-destructive/5 border-destructive/20",
  purple: "from-chart-5/10 to-chart-5/5 border-chart-5/20",
  cyan: "from-portolan-cyan/10 to-portolan-cyan/5 border-portolan-cyan/20",
  amber: "from-warning/10 to-warning/5 border-warning/20",
};

export const StatsCard = React.forwardRef<HTMLDivElement, StatsCardProps>(
  ({ title, value, subtitle, change, trend = "flat", icon, color = "blue" }, ref) => {
    if (!title) {
      return <CardSkeleton ref={ref} className="h-28" />;
    }

    const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
    const trendColor =
      trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground";

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border bg-card bg-gradient-to-br p-4 transition-all hover:shadow-md",
          COLOR_CLASSES[color ?? "blue"],
        )}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {icon &&
            (() => {
              const Icon = ICONS[icon] ?? BarChart3;
              return <Icon className="w-5 h-5 ml-2 flex-shrink-0 text-muted-foreground" />;
            })()}
        </div>
        {change !== undefined && (
          <div className={cn("flex items-center gap-1 mt-2 text-sm", trendColor)}>
            <span>{trendIcon}</span>
            <span>{Math.abs(change).toFixed(1)}%</span>
          </div>
        )}
      </div>
    );
  },
);
StatsCard.displayName = "StatsCard";
