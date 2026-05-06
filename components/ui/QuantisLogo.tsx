import Image from "next/image";
import Link from "next/link";

type QuantisLogoProps = {
  size?: number;
  withText?: boolean;
  textClassName?: string;
  className?: string;
  imageClassName?: string;
  /** Cible du lien. Par défaut "/", passer null pour rendre le logo non cliquable. */
  href?: string | null;
};

export function QuantisLogo({
  size = 28,
  withText = true,
  textClassName = "text-xs uppercase tracking-wide text-quantis-slate",
  className = "",
  imageClassName = "shrink-0 bg-transparent object-contain",
  href = "/"
}: QuantisLogoProps) {
  const content = (
    <>
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
    </>
  );

  if (href === null) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`.trim()}>
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      aria-label="Retour à l'accueil"
      className={`inline-flex items-center gap-2 transition-opacity hover:opacity-80 ${className}`.trim()}
    >
      {content}
    </Link>
  );
}
