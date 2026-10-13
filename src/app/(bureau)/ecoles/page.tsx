import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck, GraduationCap, HandCoins, Plus, Search, Send } from "lucide-react";
import { prisma } from "@/lib/db";
import { xof } from "@/lib/format";
import { paysDesProcedures } from "@/lib/pays";
import { ChampsEcole } from "@/components/champs-ecole";
import { Filtres } from "@/components/filtres";
import { Formulaire } from "@/components/formulaire";
import { Kpi } from "@/components/graphiques";
import { Tiroir } from "@/components/tiroir";
import { Badge, EnTete, Info, Progression, Vide } from "@/components/ui";
import { creerEcole } from "@/server/ecoles";
import { peutEcoles } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Écoles" };

export default async function EcolesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pays?: string; type?: string; nouveau?: string }>;
}) {
  const user = await requireUser();
  if (user.role === "PARTENAIRE") redirect("/dossiers");
  const { q, pays, type, nouveau } = await searchParams;
  const gestion = peutEcoles(user.role);

  const [ecoles, toutes, procedures] = await Promise.all([
    prisma.ecole.findMany({
      where: {
        ...(pays ? { pays } : {}),
        ...(type ? { type } : {}),
        ...(q
          ? {
              OR: [
                { nom: { contains: q, mode: "insensitive" } },
                { ville: { contains: q, mode: "insensitive" } },
                { formations: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { candidatures: { select: { statut: true } } },
      orderBy: [{ actif: "desc" }, { partenaire: "desc" }, { nom: "asc" }],
    }),
    prisma.ecole.findMany({ select: { pays: true, type: true, partenaire: true, commissionXof: true, actif: true, candidatures: { select: { statut: true } } } }),
    prisma.procedure.findMany({ where: { ecoles: true }, select: { destination: true } }),
  ]);

  const frequents = paysDesProcedures(procedures.map((procedure) => procedure.destination));
  const paysCatalogue = [...new Set(toutes.map((ecole) => ecole.pays))].sort((a, b) => a.localeCompare(b, "fr"));
  const filtre = Boolean(q || pays || type);
  const types = [...new Set(toutes.map((ecole) => ecole.type).filter((item): item is string => Boolean(item)))].sort();
  const candidatures = toutes.flatMap((ecole) => ecole.candidatures);
  const enCours = candidatures.filter((item) => item.statut === "PROPOSEE" || item.statut === "SOUMISE").length;
  const admis = candidatures.filter((item) => item.statut === "ADMIS" || item.statut === "CHOISIE").length;
  const reponses = admis + candidatures.filter((item) => item.statut === "REFUSE").length;
  const commissions = toutes
    .filter((ecole) => ecole.partenaire)
    .reduce((total, ecole) => total + ecole.commissionXof * ecole.candidatures.filter((item) => item.statut === "CHOISIE").length, 0);

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Écoles"
        icone={GraduationCap}
        description="Le catalogue des écoles proposées aux étudiants, leurs formations, leurs frais et le suivi des candidatures."
        actions={
          gestion ? (
            <Tiroir
              label="Nouvelle école"
              icone={<Plus size={16} />}
              titre="Nouvelle école"
              description="Elle sera proposée sur les dossiers d'études de son pays."
              ouvertParDefaut={nouveau === "1"}
            >
              <Formulaire action={creerEcole} submit="Ajouter l'école" succes="École ajoutée" className="grid gap-4">
                <ChampsEcole frequents={frequents} id="nouvelle" />
              </Formulaire>
            </Tiroir>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 entree-cascade">
        <Kpi titre="Écoles au catalogue" valeur={toutes.filter((ecole) => ecole.actif).length} icone={GraduationCap} detail={`dont ${toutes.filter((ecole) => ecole.actif && ecole.partenaire).length} partenaires`} />
        <Kpi titre="Candidatures en cours" valeur={enCours} icone={Send} detail="proposées ou soumises" />
        <Kpi
          titre="Taux d'admission"
          valeur={reponses ? `${Math.round((admis / reponses) * 100)} %` : "—"}
          ton="vert"
          icone={BadgeCheck}
          detail={`${admis} admission${admis > 1 ? "s" : ""} sur ${reponses} réponse${reponses > 1 ? "s" : ""}`}
        />
        <Kpi titre="Commissions attendues" valeur={commissions} format="xof" ton="desk" icone={HandCoins} detail="écoles partenaires, étudiants inscrits" />
      </div>

      <Filtres className="flex flex-wrap gap-3" action="/ecoles">
        <div className="relative min-w-60 flex-1">
          <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
          <input className="champ pl-10" name="q" placeholder="Nom, ville ou formation…" defaultValue={q ?? ""} />
        </div>
        <select className="champ w-auto" name="pays" defaultValue={pays ?? ""}>
          <option value="">Tous les pays</option>
          {paysCatalogue.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        {types.length > 0 ? (
          <select className="champ w-auto" name="type" defaultValue={type ?? ""}>
            <option value="">Tous les types</option>
            {types.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        ) : null}
      </Filtres>

      {ecoles.length === 0 ? (
        <Vide
          icone={GraduationCap}
          titre={filtre ? "Aucune école ne correspond" : "Aucune école pour l'instant"}
          texte={
            filtre
              ? "Modifiez la recherche ou les filtres."
              : "Ajoutez les écoles avec lesquelles vous travaillez : elles seront proposées dans les dossiers d'études."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 entree-cascade">
          {ecoles.map((ecole) => {
            const total = ecole.candidatures.length;
            const ecoleAdmis = ecole.candidatures.filter((item) => item.statut === "ADMIS" || item.statut === "CHOISIE").length;
            const retenus = ecole.candidatures.filter((item) => item.statut === "CHOISIE").length;
            const ecoleReponses = ecoleAdmis + ecole.candidatures.filter((item) => item.statut === "REFUSE").length;
            const formations = (ecole.formations ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
            return (
              <Link key={ecole.id} href={`/ecoles/${ecole.id}`} className={`carte carte-lien group grid gap-4 ${ecole.actif ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wide text-ink/45 uppercase">
                      {ecole.pays}
                      {ecole.ville ? ` · ${ecole.ville}` : ""}
                    </p>
                    <p className="mt-0.5 truncate font-semibold group-hover:text-desk">{ecole.nom}</p>
                    {ecole.type ? <p className="text-xs text-ink/55">{ecole.type}</p> : null}
                  </div>
                  {!ecole.actif ? (
                    <Badge ton="gris">Archivée</Badge>
                  ) : ecole.partenaire ? (
                    <Badge ton="vert" point>Partenaire</Badge>
                  ) : null}
                </div>
                {formations.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {formations.slice(0, 3).map((formation) => (
                      <span key={formation} className="rounded-lg bg-desk/[0.06] px-2 py-0.5 text-xs text-desk">{formation}</span>
                    ))}
                    {formations.length > 3 ? <span className="px-1 text-xs text-ink/45">+{formations.length - 3}</span> : null}
                  </div>
                ) : null}
                <dl className="grid grid-cols-3 gap-2 rounded-xl bg-paper p-3 text-center text-sm">
                  <div><dt className="text-xs text-ink/50">Candidatures</dt><dd className="font-bold">{total}</dd></div>
                  <div><dt className="text-xs text-ink/50">Admis</dt><dd className="font-bold text-vert">{ecoleAdmis}</dd></div>
                  <div><dt className="text-xs text-ink/50">Inscrits</dt><dd className="font-bold">{retenus}</dd></div>
                </dl>
                {ecoleReponses > 0 ? (
                  <div className="grid gap-1.5">
                    <p className="flex justify-between text-xs text-ink/55">
                      Taux d'admission <span className="font-semibold text-ink">{Math.round((ecoleAdmis / ecoleReponses) * 100)} %</span>
                    </p>
                    <Progression valeur={(ecoleAdmis / ecoleReponses) * 100} ton="vert" />
                  </div>
                ) : null}
                <p className="flex items-center justify-between text-xs text-ink/45">
                  {ecole.fraisXof ? `Scolarité ${xof(ecole.fraisXof)} / an` : "Frais non renseignés"}
                  <span className="flex items-center gap-1 font-semibold text-desk opacity-0 transition group-hover:opacity-100">Voir <ArrowRight size={14} /></span>
                </p>
              </Link>
            );
          })}
        </div>
      )}
      <Info>
        Les écoles sont proposées dans l'onglet « Écoles et candidatures » des dossiers d'études du même pays (« France public » et « France privé » proposent les écoles de France). Une école retenue pour un étudiant
        partenaire compte dans les commissions attendues.
      </Info>
    </section>
  );
}
