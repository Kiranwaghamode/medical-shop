import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder for sections that are built in later phases.
export function ComingSoon({
  icon: Icon,
  title,
  phase,
  features,
}: {
  icon: LucideIcon;
  title: string;
  phase: string;
  features: string[];
}) {
  return (
    <div className="flex flex-1 items-start justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>Coming in {phase}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
