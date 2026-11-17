/** Shared text styles for the legal/support pages. */
export const LEGAL_H2 = "mt-8 text-lg font-semibold tracking-tight";
export const LEGAL_P = "mt-3 text-sm leading-relaxed text-muted";
export const LEGAL_UL =
  "mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted";

/** Content frame for the legal/support pages; the marketing layout supplies the chrome. */
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
