import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

interface QuickActionCardProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  onClick?: () => void;
}

export function QuickActionCard({ title, description, icon: Icon, onClick }: QuickActionCardProps) {
  return (
    <Card 
      onClick={onClick} 
      className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02] border-border bg-card hover:bg-accent/5"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold mb-1">{title}</h4>
          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
