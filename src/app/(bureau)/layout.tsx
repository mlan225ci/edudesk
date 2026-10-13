import { prisma } from "@/lib/db";
import { Shell } from "@/components/shell";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function BureauLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nonLues = await prisma.notificationInterne.count({
    where: { userId: user.id, lue: false },
  });
  return (
    <Shell user={user} nonLues={nonLues}>
      {children}
    </Shell>
  );
}
