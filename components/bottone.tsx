import Link from 'next/link'
import Image from 'next/image'

type Props = {
  href: string
  children: React.ReactNode
  /** La freccia tonda che nel Figma sta fuori dalla pillola, a destra. */
  freccia?: boolean
  className?: string
}

/** La pillola rossa del design system. */
export function Bottone({ href, children, freccia = false, className = '' }: Props) {
  return (
    <Link href={href} className={`group inline-flex items-center gap-3 ${className}`}>
      <span className="rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition group-hover:brightness-110">
        {children}
      </span>
      {freccia && (
        <Image src="/img/freccia.svg" alt="" width={36} height={36} className="h-9 w-9" />
      )}
    </Link>
  )
}
