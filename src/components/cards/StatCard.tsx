import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconBgColor?: string;
  iconColor?: string;
  subtitle?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType = "positive",
  icon: Icon,
  iconBgColor = "bg-primary/20",
  iconColor = "text-primary",
  subtitle,
}: StatCardProps) {
  const getBadgeClass = () => {
    switch (changeType) {
      case "positive":
        return "stat-badge-success";
      case "negative":
        return "stat-badge-warning";
      default:
        return "stat-badge-info";
    }
  };

  return (
    <div className="stat-card animate-fade-in">
      <div className="flex items-start justify-between mb-4">
        <div className={`stat-card-icon ${iconBgColor}`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
        {change && (
          <span className={`stat-badge ${getBadgeClass()}`}>{change}</span>
        )}
      </div>
      <p className="text-3xl font-bold text-foreground mb-1">{value}</p>
      <p className="text-sm text-muted-foreground">{title}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground/70 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
