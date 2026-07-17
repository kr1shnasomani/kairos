// Route-level page transition: template remounts on every navigation, replaying
// the page-in keyframe (fade + 8px rise). Neutralized by prefers-reduced-motion.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-[page-in_200ms_ease-out]">{children}</div>;
}
