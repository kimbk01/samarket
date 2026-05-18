export function DeliveryDivider({ className = "" }: { className?: string }) {
  return <div className={`delivery-divider-block ${className}`.trim()} aria-hidden />;
}
