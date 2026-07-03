"use client";

// Designed empty state: one quiet line and one clear action, vertically centered.
export function EmptyState({ text, actionLabel, onAction }: {
  text: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-16">
      <p className="t-caption max-w-[240px]">{text}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="press bg-brass text-ink font-semibold text-sm rounded-full px-4 py-1.5">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// Shimmer placeholder to hold layout during first load, no jump.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}
