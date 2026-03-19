import Image from "next/image";

type QuantisLogoProps = {
  size?: number;
  withText?: boolean;
  textClassName?: string;
  className?: string;
};

export function QuantisLogo({
  size = 28,
  withText = true,
  textClassName = "text-xs uppercase tracking-wide text-quantis-slate",
  className = ""
}: QuantisLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <Image
        src="/images/logo.png"
        alt="Logo Quantis"
        width={size}
        height={size}
        className="rounded-md object-contain"
        priority
      />
      {withText ? <span className={textClassName}>Quantis</span> : null}
    </div>
  );
}
