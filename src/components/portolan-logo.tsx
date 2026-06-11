interface PortolanLogoProps {
  size?: number;
  className?: string;
}

export function PortolanLogo({ size = 20, className }: PortolanLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Portolan"
      className={className ?? "text-primary"}
      fill="currentColor"
    >
      <path d="M2.83 18.247l26.34-9.124L2.83 0z" />
      <path d="M29.17 32V13.753L2.83 22.877z" />
    </svg>
  );
}
