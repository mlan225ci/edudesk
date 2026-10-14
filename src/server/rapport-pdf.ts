import { formatDate, variation, xof } from "@/lib/format";
import { DocumentPdf } from "@/server/pdf";
import { calculerStatistiques, periodePrecedente, type Periode } from "@/server/statistiques";

function evolution(actuel: number, precedent: number) {
  const ecart = variation(actuel, precedent);
  if (ecart == null) return "nouveau";
  return `${ecart > 0 ? "+" : ""}${ecart} % vs période précédente`;
}

export async function pdfRapport(periode: Periode) {
  const precedente = periodePrecedente(periode);
  const [stats, avant] = await Promise.all([calculerStatistiques(periode), calculerStatistiques(precedente)]);
  const { finances, commercial, operations } = stats;
  const pdf = await DocumentPdf.creer();
  pdf.doc.setTitle(`Rapport d'activité · ${periode.libelle}`);
  pdf.entete("Rapport d'activité", periode.libelle, `Édité le ${formatDate(new Date())}`);

  pdf.titreSection("Chiffres clés");
  pdf.cartesKpi([
    { libelle: "Produits encaissés", valeur: xof(finances.produits), detail: evolution(finances.produits, avant.finances.produits) },
    { libelle: "Charges", valeur: xof(finances.charges), detail: evolution(finances.charges, avant.finances.charges) },
    { libelle: "Résultat", valeur: xof(finances.resultat), detail: finances.produits ? `marge ${Math.round((finances.resultat / finances.produits) * 100)} %` : undefined },
    { libelle: "Dossiers ouverts", valeur: String(commercial.dossiers), detail: evolution(commercial.dossiers, avant.commercial.dossiers) },
    {
      libelle: "Prospects",
      valeur: String(commercial.prospects),
      detail: commercial.prospects ? `${Math.round((commercial.convertis / commercial.prospects) * 100)} % convertis` : undefined,
    },
    {
      libelle: "Étapes clôturées",
      valeur: String(operations.etapesCloturees),
      detail: operations.tauxATemps != null ? `${operations.tauxATemps} % dans les délais` : undefined,
    },
    { libelle: "Admissions", valeur: String(operations.admissions) },
    { libelle: "Visas obtenus", valeur: String(operations.visas) },
    { libelle: "Devis acceptés", valeur: xof(commercial.montantAcceptes), detail: `${commercial.devisAcceptes} sur ${commercial.devisEmis} émis` },
  ]);

  pdf.titreSection("Compte de résultat");
  pdf.tableau(
    [
      { titre: "Poste", largeur: 5 },
      { titre: "Période", largeur: 2.4, droite: true },
      { titre: "Précédente", largeur: 2.4, droite: true },
    ],
    [
      ...finances.parType.map((ligne, index) => [`Produits · ${ligne.label}`, xof(ligne.montant), xof(avant.finances.parType[index]?.montant ?? 0)]),
      ...finances.parCategorie.map((ligne) => [
        `Charges · ${ligne.label}`,
        xof(ligne.montant),
        xof(avant.finances.parCategorie.find((item) => item.label === ligne.label)?.montant ?? 0),
      ]),
      ["Résultat", xof(finances.resultat), xof(avant.finances.resultat)],
    ],
  );

  pdf.titreSection("Encaissements par moyen de paiement");
  pdf.tableau(
    [
      { titre: "Moyen", largeur: 5 },
      { titre: "Montant", largeur: 2.4, droite: true },
    ],
    finances.parMode.map((ligne) => [ligne.label, xof(ligne.montant)]),
  );

  if (commercial.parProcedure.length) {
    pdf.titreSection("Dossiers ouverts par procédure");
    pdf.tableau(
      [
        { titre: "Procédure", largeur: 5 },
        { titre: "Dossiers", largeur: 2, droite: true },
      ],
      commercial.parProcedure.map(([label, nombre]) => [label, String(nombre)]),
    );
  }

  if (commercial.parSource.length) {
    pdf.titreSection("Prospects par source");
    pdf.tableau(
      [
        { titre: "Source", largeur: 5 },
        { titre: "Prospects", largeur: 2, droite: true },
      ],
      commercial.parSource.map(([label, nombre]) => [label, String(nombre)]),
    );
  }

  if (operations.equipe.length) {
    pdf.titreSection("Équipe : étapes clôturées");
    pdf.tableau(
      [
        { titre: "Collaborateur", largeur: 5 },
        { titre: "Clôturées", largeur: 2, droite: true },
        { titre: "En retard", largeur: 2, droite: true },
      ],
      operations.equipe.map((ligne) => [ligne.nom, String(ligne.clotures), String(ligne.retards)]),
    );
  }

  pdf.titreSection("Communication");
  pdf.paragraphe(
    `${operations.sms} SMS et ${operations.mails} e-mail(s) générés · ${operations.traductions} traduction(s) livrée(s)${
      operations.dureeMoyenneHeures != null ? ` · durée moyenne d'une étape : ${operations.dureeMoyenneHeures} h` : ""
    }.`,
  );

  return {
    nom: `Rapport-${periode.cle}.pdf`,
    octets: await pdf.terminer(pdf.mentionsLegales(`Rapport d'activité ${periode.libelle} · période précédente : ${precedente.libelle}`)),
  };
}
