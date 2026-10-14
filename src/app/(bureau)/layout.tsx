import { prisma } from "@/lib/db";
import { Shell } from "@/components/shell";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function BureauLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [nonLues, messagesNonLus] = await Promise.all([
    prisma.notificationInterne.count({ where: { userId: user.id, lue: false } }),
    user.role === "PARTENAIRE" ? 0 : prisma.message.count({ where: { aId: user.id, lu: false } }),
  ]);
  return (
    <Shell user={user} nonLues={nonLues} messagesNonLus={messagesNonLus}>
      {children}
    </Shell>
  );
}
