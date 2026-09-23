import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

/** The platform mark, kept as a shared asset across the legacy and SIH views. */
export function LogoMark({ className }: { className?: string }) {
  return <img src={logo} alt="" aria-hidden="true" className={cn("h-6 w-6 object-contain", className)} />;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">SIH Control</span>
    </span>
  );
}
