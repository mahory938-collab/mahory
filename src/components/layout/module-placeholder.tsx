import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type ModulePlaceholderProps = {
  icon?: LucideIcon;
  title: string;
  description: string;
  features: string[];
};

/**
 * Consistent "coming in next milestone" surface so navigation never dead-ends.
 */
export function ModulePlaceholder({
  icon: Icon = Construction,
  title,
  description,
  features,
}: ModulePlaceholderProps) {
  return (
    <Card className="mx-auto max-w-3xl rounded-2xl border-dashed shadow-soft">
      <CardContent className="p-8">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft">
            <Icon className="size-6 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold">{title}</h2>
              <Badge variant="secondary" className="rounded-full">
                En construcción
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-2 rounded-xl border bg-surface px-3 py-2.5 text-sm"
            >
              <span className="size-1.5 rounded-full bg-primary" />
              {feature}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
