import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** shadcn tooltip wrapper for icon-only helper buttons. */
export function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
