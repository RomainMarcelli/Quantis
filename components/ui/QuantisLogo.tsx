import Image from "next/image";

type QuantisLogoProps = {
  size?: number;
  withText?: boolean;
  textClassName?: string;
  className?: string;
  imageClassName?: string;
};

export function QuantisLogo({
  size = 28,
  withText = true,
  textClassName = "text-xs uppercase tracking-wide text-quantis-slate",
  className = "",
  imageClassName = "shrink-0 bg-transparent object-contain"
}: QuantisLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`.trim()}>
      {/* Source unique du logo applicatif pour garantir une cohérence globale dans toute l'application. */}
      <Image
        src="/images/LogoV3.png"
        alt="Logo Quantis"
        width={size}
        height={size}
        className={imageClassName}
        priority
      />
      {withText ? <span className={textClassName}>Quantis</span> : null}
    </div>
  );
}
