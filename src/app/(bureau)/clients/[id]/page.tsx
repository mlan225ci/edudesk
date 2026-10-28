import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FileStack, FolderOpen, FolderPlus, Globe2, Handshake, Mail, MessagesSquare, Pencil, Phone, ScrollText, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatJour, nomComplet, xof } from "@/lib/format";
import { STATUTS, TON_STATUT } from "@/lib/labels";
import { modifierClient, ouvrirDossier } from "@/server/actions";
import { Journal } from "@/components/journal";
import { lireJournal } from "@/server/historique";
import { lireModules } from "@/server/modules";
import { ouvrirGroupeClient } from "@/server/groupes-actions";
import { peutCreerClient, peutHistorique, voitFinance } from "@/server/permissions";
import { requireUser } from "@/server/session";
import { ChampsClient } from "@/components/champs-client";
import { ListeDocuments, type DocumentVue } from "@/components/documents";
import { Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Avatar, Badge, Champ, Progression, Vide } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { prenom: true, nom: true } });
  return { title: client ? nomComplet(client) : "Client" };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      partenaire: true,
      dossiers: {
        include: { procedure: true, paiements: { select: { montant: true } }, etapes: { select: { statut: true, titre: true }, orderBy: { rang: "asc" } } },
        orderBy: { ouvertLe: "desc" },
      },
    },
  });
  if (!client) notFound();
  if (user.role === "PARTENAIRE" && client.partenaireId !== user.partenaireId) notFound();

  const collaborateur = user.role !== "PARTENAIRE";
  const creation = peutCreerClient(user.role);
  const [partenaires, procedures] = await Promise.all([
    collaborateur ? prisma.partenaire.findMany({ select: { id: true, nom: true }, orderBy: { nom: "asc" } }) : [],
    creation ? prisma.procedure.findMany({ where: { actif: true }, select: { id: true, nom: true }, orderBy: { nom: "asc" } }) : [],
  ]);
  const pieces = collaborateur
    ? await prisma.pieceDossier.findMany({
        where: { dossier: { clientId: client.id }, recue: true, reportee: false },
        select: {
          id: true,
          libelle: true,
          recue: true,
          recueLe: true,
          fichierChemin: true,
          dossier: { select: { reference: true } },
          etape: { select: { titre: true } },
        },
        orderBy: [{ recueLe: "desc" }, { ordre: "asc" }],
      })
    : [];
  const documents: DocumentVue[] = pieces.map((piece) => ({
    id: piece.id,
    libelle: piece.libelle,
    recue: piece.recue,
    fichier: Boolean(piece.fichierChemin),
    recueLe: piece.recueLe,
    etape: piece.etape?.titre ?? null,
    dossier: piece.dossier.reference,
  }));
  const finance = voitFinance(user.role);
  const direction = peutHistorique(user.role);
  const modules = await lireModules();
  const journal = direction
    ? await lireJournal({ clientId: client.id, dossierIds: client.dossiers.map((dossier) => dossier.id), take: 40 })
    : [];
  const totalPaye = client.dossiers.reduce((somme, dossier) => somme + dossier.paiements.reduce((s, p) => s + p.montant, 0), 0);

  return (
    <section className="grid gap-6">
      <Link href="/clients" className="bouton-fantome w-fit -ml-2.5">
        <ArrowLeft size={16} /> Clients
      </Link>

      <header className="carte overflow-hidden !p-0">
        <div className="flex items-center gap-4 bg-gradient-to-r from-desk/90 to-desk/60 px-5 py-6">
          <div className="rounded-full ring-4 ring-white/80">
            <Avatar prenom={client.prenom} nom={client.nom} taille="lg" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{nomComplet(client)}</h1>
        </div>
        <div className="px-5 pt-5 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink/55">Client depuis le {formatJour(client.creeLe)}</p>
            <div className="flex flex-wrap gap-2">
              {creation ? (
                <Tiroir label="Ouvrir un dossier" icone={<FolderPlus size={16} />} titre="Nouveau dossier" description={`Pour ${nomComplet(client)}`}>
                  <Formulaire action={ouvrirDossier} submit="Ouvrir le dossier" succes="Dossier ouvert" className="grid gap-4">
                    <input type="hidden" name="clientId" value={client.id} />
                    <Champ label="Procédure" aide="Le dossier démarre à la première étape et le responsable est prévenu par SMS.">
                      <select className="champ" name="procedureId" required>
                        {procedures.map((procedure) => (
                          <option key={procedure.id} value={procedure.id}>{procedure.nom}</option>
                        ))}
                      </select>
                    </Champ>
                  </Formulaire>
                </Tiroir>
              ) : null}
            {collaborateur && modules.messagerie ? (
              <form action={ouvrirGroupeClient}>
                <input type="hidden" name="clientId" value={client.id} />
                <button className="bouton-second" type="submit"><MessagesSquare size={15} /> Groupe d&apos;échanges</button>
              </form>
            ) : null}
            {collaborateur ? (
              <Tiroir label="Modifier" variante="second" icone={<Pencil size={15} />} titre="Modifier le client">
                  <Formulaire action={modifierClient} submit="Enregistrer les modifications" succes="Fiche mise à jour" reinitialiser={false} className="grid gap-4">
                    <input type="hidden" name="clientId" value={client.id} />
                    <ChampsClient client={client} partenaires={partenaires} />
                  </Formulaire>
                </Tiroir>
              ) : null}
            </div>
          </div>
        <dl className="mt-5 grid gap-4 border-t border-ink/[0.06] pt-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-2.5">
            <Phone size={16} className="text-ink/35" />
            <a href={`tel:${client.telephone}`} className="font-medium hover:text-desk">{client.telephone}</a>
          </div>
          <div className="flex items-center gap-2.5">
            <Mail size={16} className="text-ink/35" />
            <span className="truncate">{client.email || <span className="text-ink/40">Pas d'e-mail</span>}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Globe2 size={16} className="text-ink/35" />
            <span>{client.paysVise || <span className="text-ink/40">Pays non précisé</span>}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Handshake size={16} className="text-ink/35" />
            <span>{client.partenaire?.nom ?? <span className="text-ink/40">Sans partenaire</span>}</span>
          </div>
          {client.garantNom ? (
            <div className="flex items-center gap-2.5 sm:col-span-2">
              <ShieldCheck size={16} className="text-ink/35" />
              <span>Garant : {client.garantNom} {client.garantTelephone ? `· ${client.garantTelephone}` : ""}</span>
            </div>
          ) : null}
          {finance ? (
            <div className="flex items-center gap-2.5 sm:col-span-2">
              <span className="text-ink/50">Total encaissé :</span>
              <span className="font-bold text-vert">{xof(totalPaye)}</span>
            </div>
          ) : null}
        </dl>
        </div>
      </header>

      <div className="grid gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <FolderOpen size={19} className="text-desk" /> Dossiers <span className="text-sm font-medium text-ink/40">({client.dossiers.length})</span>
        </h2>
        {client.dossiers.length === 0 ? (
          <Vide icone={FolderPlus} titre="Aucun dossier" texte="Ouvrez un dossier pour lancer la procédure de ce client." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 entree-cascade">
            {client.dossiers.map((dossier) => {
              const faites = dossier.etapes.filter((etape) => etape.statut === "CLOTUREE").length;
              const ratio = dossier.etapes.length ? (faites / dossier.etapes.length) * 100 : 0;
              const courante = dossier.etapes.find((etape) => etape.statut === "EN_COURS");
              return (
                <Link key={dossier.id} href={`/dossiers/${dossier.id}`} className="carte carte-lien group">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold group-hover:text-desk">{dossier.procedure.nom}</p>
                      <p className="text-xs text-ink/45">{dossier.reference} · {formatJour(dossier.ouvertLe)}</p>
                    </div>
                    <Badge ton={TON_STATUT[dossier.statut]} point>{STATUTS[dossier.statut]}</Badge>
                  </div>
                  <p className="mt-4 text-sm text-ink/65">{courante ? `En cours : ${courante.titre}` : "Aucune étape ouverte"}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1"><Progression valeur={ratio} ton={ratio === 100 ? "vert" : "desk"} /></div>
                    <ArrowRight size={16} className="text-ink/30 transition group-hover:translate-x-0.5 group-hover:text-desk" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {direction ? (
        <div className="grid gap-3" id="historique">
          <h2 className="flex items-center justify-between gap-2 text-lg font-bold">
            <span className="flex items-center gap-2"><ScrollText size={19} className="text-desk" /> Historique</span>
            <Link href={`/historique?client=${client.id}`} className="text-sm font-semibold text-desk hover:underline">Tout voir</Link>
          </h2>
          <div className="carte">
            <Journal lignes={journal} vide="Aucune action enregistrée pour ce client." />
          </div>
        </div>
      ) : null}

      {collaborateur ? (
        <div className="grid gap-3" id="documents">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FileStack size={19} className="text-desk" /> Documents du client
            <span className="text-sm font-medium text-ink/40">({documents.length})</span>
          </h2>
          <div className="carte">
            <ListeDocuments documents={documents} vide="Aucun document reçu pour ce client." peutJoindre />
          </div>
        </div>
      ) : null}
    </section>
  );
}
