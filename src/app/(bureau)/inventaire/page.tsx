import { redirect } from "next/navigation";
import type { EtatMateriel } from "@prisma/client";
import { Boxes, CircleDollarSign, MapPin, PackagePlus, Wrench } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatJour, nomComplet, xof } from "@/lib/format";
import { ETATS_MATERIEL, labelEtat } from "@/lib/labels";
import { BoutonEnvoi, FormAction, Formulaire } from "@/components/formulaire";
import { Kpi } from "@/components/graphiques";
import { Tiroir } from "@/components/tiroir";
import { Badge, Champ, EnTete, Onglets, Vide } from "@/components/ui";
import { ajouterMateriel, modifierMateriel } from "@/server/actions";
import { peutInventaire } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Inventaire" };

const TON_ETAT: Record<EtatMateriel, "vert" | "edu" | "cap" | "gris"> = { BON: "vert", USAGE: "edu", PANNE: "cap", REFORME: "gris" };

export default async function InventairePage({ searchParams }: { searchParams: Promise<{ categorie?: string; nouveau?: string }> }) {
  const user = await requireUser();
  if (!peutInventaire(user.role)) redirect("/tableau-de-bord");
  const { categorie, nouveau } = await searchParams;
  const [materiels, collaborateurs] = await Promise.all([
    prisma.materiel.findMany({ include: { affecteA: true }, orderBy: [{ categorie: "asc" }, { designation: "asc" }] }),
    prisma.user.findMany({ where: { actif: true, role: { not: "PARTENAIRE" } }, orderBy: { prenom: "asc" } }),
  ]);
  const categories = [...new Set(materiels.map((materiel) => materiel.categorie))];
  const affiches = categorie ? materiels.filter((materiel) => materiel.categorie === categorie) : materiels;
  const actifs = materiels.filter((materiel) => materiel.etat !== "REFORME");
  const valeur = actifs.reduce((somme, materiel) => somme + materiel.valeurXof, 0);
  const enPanne = materiels.filter((materiel) => materiel.etat === "PANNE").length;

  return (
    <section className="grid gap-6">
      <EnTete
        titre="Inventaire"
        icone={Boxes}
        description="Le matériel du bureau, son état et la personne qui l'utilise."
        actions={
          <Tiroir label="Ajouter du matériel" icone={<PackagePlus size={16} />} titre="Nouveau matériel" ouvertParDefaut={nouveau === "1"}>
            <Formulaire action={ajouterMateriel} submit="Ajouter à l'inventaire" succes="Matériel ajouté" className="grid gap-4">
              <Champ label="Désignation"><input className="champ" name="designation" placeholder="Ex. Ordinateur portable HP" required autoFocus /></Champ>
              <Champ label="Catégorie"><input className="champ" name="categorie" placeholder="Informatique, mobilier…" list="categories" /></Champ>
              <datalist id="categories">
                {["Informatique", "Mobilier", "Téléphonie", "Véhicule", "Climatisation", ...categories]
                  .filter((item, index, liste) => liste.indexOf(item) === index)
                  .map((item) => (
                    <option key={item} value={item} />
                  ))}
              </datalist>
              <div className="grid gap-4 sm:grid-cols-2">
                <Champ label="N° de série"><input className="champ" name="numeroSerie" placeholder="Facultatif" /></Champ>
                <Champ label="Valeur d'achat (F CFA)"><input className="champ" name="valeurXof" inputMode="numeric" placeholder="0" /></Champ>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Champ label="Acquis le"><input className="champ" type="date" name="acquisLe" /></Champ>
                <Champ label="Emplacement"><input className="champ" name="localisation" placeholder="Bureau, salle…" /></Champ>
              </div>
              <Champ label="Utilisé par">
                <select className="champ" name="affecteAId" defaultValue="">
                  <option value="">Personne</option>
                  {collaborateurs.map((collaborateur) => (
                    <option key={collaborateur.id} value={collaborateur.id}>{nomComplet(collaborateur)}</option>
                  ))}
                </select>
              </Champ>
            </Formulaire>
          </Tiroir>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi titre="Équipements actifs" valeur={actifs.length} icone={Boxes} detail={`${materiels.length} au total`} />
        <Kpi titre="Valeur d'achat" valeur={valeur} format="xof" icone={CircleDollarSign} />
        <Kpi titre="En panne" valeur={enPanne} icone={Wrench} ton={enPanne ? "cap" : "vert"} />
      </div>

      {categories.length > 1 ? (
        <Onglets
          actif={categorie ? `/inventaire?categorie=${encodeURIComponent(categorie)}` : "/inventaire"}
          onglets={[
            { href: "/inventaire", label: "Tout", nombre: materiels.length },
            ...categories.map((item) => ({
              href: `/inventaire?categorie=${encodeURIComponent(item)}`,
              label: item,
              nombre: materiels.filter((materiel) => materiel.categorie === item).length,
            })),
          ]}
        />
      ) : null}

      {affiches.length === 0 ? (
        <Vide icone={Boxes} titre="Aucun matériel enregistré" texte="Ajoutez ordinateurs, imprimantes, mobilier… pour savoir qui utilise quoi." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 entree-cascade">
          {affiches.map((materiel) => (
            <article key={materiel.id} className={`carte grid gap-3 ${materiel.etat === "REFORME" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{materiel.designation}</p>
                  <p className="text-xs text-ink/50">{materiel.categorie}{materiel.numeroSerie ? ` · S/N ${materiel.numeroSerie}` : ""}</p>
                </div>
                <Badge ton={TON_ETAT[materiel.etat]} point>{labelEtat(materiel.etat)}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/55">
                {materiel.localisation ? <span className="flex items-center gap-1"><MapPin size={12} /> {materiel.localisation}</span> : null}
                {materiel.valeurXof ? <span>{xof(materiel.valeurXof)}</span> : null}
                {materiel.acquisLe ? <span>acquis le {formatJour(materiel.acquisLe)}</span> : null}
              </div>
              <FormAction action={modifierMateriel} succes="Matériel mis à jour" className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-ink/[0.06] pt-3">
                <input type="hidden" name="materielId" value={materiel.id} />
                <select className="champ py-2 text-xs" name="affecteAId" defaultValue={materiel.affecteAId ?? ""} aria-label="Utilisé par">
                  <option value="">Non affecté</option>
                  {collaborateurs.map((collaborateur) => (
                    <option key={collaborateur.id} value={collaborateur.id}>{nomComplet(collaborateur)}</option>
                  ))}
                </select>
                <select className="champ w-auto py-2 text-xs" name="etat" defaultValue={materiel.etat} aria-label="État">
                  {ETATS_MATERIEL.map((etat) => (
                    <option key={etat.value} value={etat.value}>{etat.label}</option>
                  ))}
                </select>
                <BoutonEnvoi className="bouton-second px-3 py-2 text-xs">OK</BoutonEnvoi>
              </FormAction>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
