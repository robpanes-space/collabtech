import { PageContainer, SiteFooter, SiteHeader } from "@/components/layout/site-header";
import { requireSession } from "@/lib/auth/server";

/** Every dashboard page requires a session (the proxy redirects first; this is a backstop). */
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  return (
    <>
      <SiteHeader userEmail={session.email} displayName={session.displayName} />
      <PageContainer>{children}</PageContainer>
      <SiteFooter />
    </>
  );
}
