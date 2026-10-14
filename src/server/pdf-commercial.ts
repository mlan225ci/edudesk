import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { prisma } from "../lib/db";
import { etatDevis, etatFacture, lireLignes, montantEnLettres, type EtatDocument, type LigneDocument } from "../lib/facturation";
import { formatJour, nomComplet, xof } from "../lib/format";
import { labelMode } from "../lib/labels";
import { lireEntreprise, type Entreprise } from "./parametres";
import { texteSur, type FichierPdf } from "./pdf";

type Couleur = ReturnType<typeof rgb>;

function hex(code: string): Couleur {
  return rgb(parseInt(code.slice(1, 3), 16) / 255, parseInt(code.slice(3, 5), 16) / 255, parseInt(code.slice(5, 7), 16) / 255);
}

const ENCRE = hex("#14284b");
const BLEU = hex("#1f4f99");
const OR = hex("#f2b705");
const FOND = hex("#f4f6fa");
const ZEBRE = hex("#f8f9fc");
const TRAIT = hex("#e1e5ed");
const GRIS = hex("#6b7385");
const GRIS_FONCE = hex("#3d4558");
const VERT = hex("#1f8a5b");
const ROUGE = hex("#c81d25");
const BLANC = rgb(1, 1, 1);

const TEINTES: Record<EtatDocument["ton"], { texte: Couleur; fond: Couleur }> = {
  desk: { texte: BLEU, fond: hex("#e5ecf8") },
  edu: { texte: hex("#8a6500"), fond: hex("#fdf2cf") },
  cap: { texte: ROUGE, fond: hex("#fbe4e5") },
  vert: { texte: VERT, fond: hex("#e0f2ea") },
  gris: { texte: GRIS, fond: hex("#eceef3") },
  mission: { texte: hex("#a35a12"), fond: hex("#fbebd9") },
};

const LARGEUR = 595.28;
const HAUTEUR = 841.89;
const MARGE = 44;
const UTILE = LARGEUR - 2 * MARGE;
const PIED = 80;

type Police = "normal" | "gras" | "italique";
type OptionsTexte = { taille?: number; police?: Police; couleur?: Couleur; align?: "gauche" | "droite" | "centre" };
type Paiement = { date: Date; numero: string; mode: string; reference: string | null; montant: number };

class Gabarit {
  page!: PDFPage;
  y = 0;

  private constructor(
    readonly doc: PDFDocument,
    private polices: Record<Police, PDFFont>,
    private logo: PDFImage | null,
    readonly entreprise: Entreprise,
    private type: string,
    private numero: string,
  ) {}

  static async creer(type: string, numero: string, titre: string, sujet: string) {
    const doc = await PDFDocument.create();
    const polices = {
      normal: await doc.embedFont(StandardFonts.Helvetica),
      gras: await doc.embedFont(StandardFonts.HelveticaBold),
      italique: await doc.embedFont(StandardFonts.HelveticaOblique),
    };
    const octets = await readFile(path.join(process.cwd(), "public", "logo-pdf.png")).catch(() => null);
    const logo = octets ? await doc.embedPng(octets).catch(() => null) : null;
    const entreprise = await lireEntreprise();
    doc.setTitle(texteSur(titre));
    doc.setSubject(texteSur(sujet));
    doc.setAuthor(texteSur(entreprise.nom));
    doc.setCreator(texteSur(entreprise.nom));
    doc.setProducer(texteSur(entreprise.nom));
    doc.setLanguage("fr-FR");
    return new Gabarit(doc, polices, logo, entreprise, type, numero);
  }

  largeur(texte: string, taille: number, police: Police = "normal") {
    return this.polices[police].widthOfTextAtSize(texteSur(texte), taille);
  }

  texte(texte: string, x: number, y: number, options: OptionsTexte = {}) {
    const taille = options.taille ?? 9.5;
    const police = options.police ?? "normal";
    const propre = texteSur(texte);
    const largeur = this.largeur(propre, taille, police);
    const decalage = options.align === "droite" ? largeur : options.align === "centre" ? largeur / 2 : 0;
    this.page.drawText(propre, { x: x - decalage, y, size: taille, font: this.polices[police], color: options.couleur ?? ENCRE });
  }

  couper(texte: string, largeurMax: number, taille: number, police: Police = "normal") {
    const lignes: string[] = [];
    for (const paragraphe of texteSur(texte).split("\n")) {
      let courante = "";
      for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
        const essai = courante ? `${courante} ${mot}` : mot;
        if (this.largeur(essai, taille, police) > largeurMax && courante) {
          lignes.push(courante);
          courante = mot;
        } else courante = essai;
      }
      lignes.push(courante);
    }
    return lignes;
  }

  tronquer(texte: string, largeurMax: number, taille: number, police: Police = "normal") {
    let propre = texteSur(texte);
    if (this.largeur(propre, taille, police) <= largeurMax) return propre;
    while (propre.length > 1 && this.largeur(`${propre}…`, taille, police) > largeurMax) propre = propre.slice(0, -1);
    return `${propre.trimEnd()}…`;
  }

  /** Rectangle repéré par son coin supérieur gauche, aux angles arrondis si `rayon` est fourni. */
  rectangle(x: number, haut: number, largeur: number, hauteur: number, options: { fond?: Couleur; bord?: Couleur; rayon?: number; epaisseur?: number }) {
    const rayon = Math.min(options.rayon ?? 0, hauteur / 2, largeur / 2);
    const bord = options.bord ? { borderColor: options.bord, borderWidth: options.epaisseur ?? 0.8 } : {};
    if (rayon <= 0) {
      this.page.drawRectangle({ x, y: haut - hauteur, width: largeur, height: hauteur, color: options.fond, ...bord });
      return;
    }
    const r = rayon;
    const chemin = `M ${r} 0 H ${largeur - r} Q ${largeur} 0 ${largeur} ${r} V ${hauteur - r} Q ${largeur} ${hauteur} ${largeur - r} ${hauteur} H ${r} Q 0 ${hauteur} 0 ${hauteur - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(chemin, { x, y: haut, color: options.fond, ...bord });
  }

  filet(x: number, y: number, largeur: number, couleur = TRAIT, epaisseur = 0.7) {
    this.page.drawRectangle({ x, y, width: largeur, height: epaisseur, color: couleur });
  }

  private bandeau() {
    this.page.drawRectangle({ x: 0, y: HAUTEUR - 7, width: LARGEUR * 0.7, height: 7, color: ENCRE });
    this.page.drawRectangle({ x: LARGEUR * 0.7, y: HAUTEUR - 7, width: LARGEUR * 0.3, height: 7, color: OR });
  }

  pastille(etat: EtatDocument, xDroite: number, haut: number) {
    const teinte = TEINTES[etat.ton];
    const libelle = etat.label.toUpperCase();
    const largeur = this.largeur(libelle, 7.5, "gras") + 22;
    this.rectangle(xDroite - largeur, haut, largeur, 18, { fond: teinte.fond, rayon: 9 });
    this.texte(libelle, xDroite - largeur / 2, haut - 12.2, { taille: 7.5, police: "gras", couleur: teinte.texte, align: "centre" });
  }

  premierePage(etat: EtatDocument | null) {
    this.page = this.doc.addPage([LARGEUR, HAUTEUR]);
    this.bandeau();
    let yGauche = HAUTEUR - 28;
    if (this.logo) {
      const dimensions = this.logo.scaleToFit(196, 66);
      this.page.drawImage(this.logo, { x: MARGE - 8, y: yGauche - dimensions.height, width: dimensions.width, height: dimensions.height });
      yGauche -= dimensions.height + 2;
    } else {
      this.texte(this.entreprise.nom, MARGE, yGauche - 24, { taille: 22, police: "gras" });
      yGauche -= 36;
    }
    const contact = [this.entreprise.telephone && `Tél. ${this.entreprise.telephone}`, this.entreprise.email].filter(Boolean).join("   ·   ");
    for (const ligne of [this.entreprise.adresse, contact, this.entreprise.siteWeb].filter(Boolean)) {
      this.texte(this.tronquer(ligne, 270, 8), MARGE, yGauche - 8, { taille: 8, couleur: GRIS });
      yGauche -= 11.5;
    }

    const droite = LARGEUR - MARGE;
    this.texte(this.type.toUpperCase(), droite, HAUTEUR - 68, { taille: 30, police: "gras", align: "droite" });
    this.texte(`N° ${this.numero}`, droite, HAUTEUR - 88, { taille: 11, police: "gras", couleur: BLEU, align: "droite" });
    if (etat) this.pastille(etat, droite, HAUTEUR - 98);

    this.y = Math.min(yGauche - 10, HAUTEUR - 128);
    this.filet(MARGE, this.y, UTILE);
    this.y -= 24;
  }

  private pageSuite() {
    this.page = this.doc.addPage([LARGEUR, HAUTEUR]);
    this.bandeau();
    if (this.logo) {
      const dimensions = this.logo.scaleToFit(124, 42);
      this.page.drawImage(this.logo, { x: MARGE - 5, y: HAUTEUR - 22 - dimensions.height, width: dimensions.width, height: dimensions.height });
    } else this.texte(this.entreprise.nom, MARGE, HAUTEUR - 44, { taille: 14, police: "gras" });
    this.texte(`${this.type} N° ${this.numero}`, LARGEUR - MARGE, HAUTEUR - 42, { taille: 10, police: "gras", align: "droite" });
    this.texte("Suite", LARGEUR - MARGE, HAUTEUR - 55, { taille: 8, couleur: GRIS, align: "droite" });
    this.y = HAUTEUR - 76;
    this.filet(MARGE, this.y, UTILE);
    this.y -= 22;
  }

  /** Passe à une nouvelle page si la hauteur demandée ne tient plus ; renvoie vrai dans ce cas. */
  besoin(hauteur: number) {
    if (this.y - hauteur >= PIED) return false;
    this.pageSuite();
    return true;
  }

  blocs(client: { titre: string; nom: string; lignes: string[] }, details: [string, string][]) {
    const ecart = 16;
    const largeurGauche = 262;
    const largeurDroite = UTILE - largeurGauche - ecart;
    const xDroite = MARGE + largeurGauche + ecart;
    const nom = this.couper(client.nom, largeurGauche - 32, 12.5, "gras");
    const lignes = client.lignes.filter(Boolean).flatMap((ligne) => this.couper(ligne, largeurGauche - 32, 8.8));
    const hauteur = Math.max(36 + nom.length * 15 + lignes.length * 12.5 + 12, 14 + details.length * 19 + 8, 96);
    this.besoin(hauteur + 20);
    const haut = this.y;

    this.rectangle(MARGE, haut, largeurGauche, hauteur, { fond: FOND, rayon: 8 });
    this.texte(client.titre.toUpperCase(), MARGE + 16, haut - 20, { taille: 7.5, police: "gras", couleur: GRIS });
    this.page.drawRectangle({ x: MARGE + 16, y: haut - 27, width: 20, height: 2, color: OR });
    let y = haut - 46;
    for (const ligne of nom) {
      this.texte(ligne, MARGE + 16, y, { taille: 12.5, police: "gras" });
      y -= 15;
    }
    y -= 1;
    for (const ligne of lignes) {
      this.texte(ligne, MARGE + 16, y, { taille: 8.8, couleur: GRIS_FONCE });
      y -= 12.5;
    }

    this.rectangle(xDroite, haut, largeurDroite, hauteur, { bord: TRAIT, rayon: 8 });
    let yDetail = haut - 14;
    details.forEach(([libelle, valeur], index) => {
      this.texte(libelle, xDroite + 14, yDetail - 13, { taille: 8.3, couleur: GRIS });
      const place = largeurDroite - 38 - this.largeur(libelle, 8.3);
      this.texte(this.tronquer(valeur, place, 8.8, "gras"), xDroite + largeurDroite - 14, yDetail - 13, { taille: 8.8, police: "gras", align: "droite" });
      if (index < details.length - 1) this.filet(xDroite + 14, yDetail - 19.5, largeurDroite - 28, TRAIT, 0.5);
      yDetail -= 19;
    });
    this.y = haut - hauteur - 24;
  }

  objet(texte: string) {
    const lignes = this.couper(texte, UTILE - 52, 10.5, "gras");
    this.besoin(lignes.length * 14 + 16);
    this.texte("OBJET", MARGE, this.y - 0.5, { taille: 7.5, police: "gras", couleur: GRIS });
    lignes.forEach((ligne, index) => this.texte(ligne, MARGE + 48, this.y - index * 14, { taille: 10.5, police: "gras" }));
    this.y -= lignes.length * 14 + 14;
  }

  tableau(lignes: LigneDocument[]) {
    const largeurs = { numero: 32, quantite: 46, prix: 98, montant: 106 };
    const largeurDesignation = UTILE - largeurs.numero - largeurs.quantite - largeurs.prix - largeurs.montant;
    const xDesignation = MARGE + largeurs.numero;
    const finQuantite = xDesignation + largeurDesignation + largeurs.quantite;
    const finPrix = finQuantite + largeurs.prix;
    const finMontant = finPrix + largeurs.montant;
    const enTete = () => {
      this.rectangle(MARGE, this.y, UTILE, 26, { fond: ENCRE, rayon: 6 });
      const y = this.y - 16.5;
      const style = { taille: 7.5, police: "gras" as const, couleur: BLANC };
      this.texte("N°", MARGE + 12, y, style);
      this.texte("DÉSIGNATION", xDesignation + 8, y, style);
      this.texte("QTÉ", finQuantite - 10, y, { ...style, align: "droite" });
      this.texte("PRIX UNITAIRE", finPrix - 10, y, { ...style, align: "droite" });
      this.texte("MONTANT", finMontant - 12, y, { ...style, align: "droite" });
      this.y -= 26;
    };
    this.besoin(60);
    enTete();
    lignes.forEach((ligne, index) => {
      const morceaux = this.couper(ligne.libelle, largeurDesignation - 16, 9.5);
      const hauteur = morceaux.length * 12.5 + 15;
      if (this.besoin(hauteur)) enTete();
      if (index % 2 === 1) this.page.drawRectangle({ x: MARGE, y: this.y - hauteur, width: UTILE, height: hauteur, color: ZEBRE });
      const y = this.y - 17;
      this.texte(String(index + 1).padStart(2, "0"), MARGE + 12, y, { taille: 8.5, couleur: GRIS });
      morceaux.forEach((morceau, rang) => this.texte(morceau, xDesignation + 8, y - rang * 12.5, { taille: 9.5 }));
      this.texte(String(ligne.quantite), finQuantite - 10, y, { taille: 9.5, align: "droite" });
      this.texte(xof(ligne.prixUnitaire), finPrix - 10, y, { taille: 9.5, couleur: GRIS_FONCE, align: "droite" });
      this.texte(xof(ligne.quantite * ligne.prixUnitaire), finMontant - 12, y, { taille: 9.5, police: "gras", align: "droite" });
      this.y -= hauteur;
      this.filet(MARGE, this.y, UTILE, TRAIT, 0.6);
    });
    this.y -= 20;
  }

  totaux(options: { total: number; regle?: number; phrase: string; tampon?: { titre: string; detail: string } }) {
    const largeurDroite = 238;
    const xDroite = LARGEUR - MARGE - largeurDroite;
    const lettres = this.couper(`${montantEnLettres(options.total)}.`, xDroite - MARGE - 28, 9.5, "italique");
    const hauteurGauche = 28 + lettres.length * 13 + (options.tampon ? 78 : 0);
    const hauteurDroite = options.regle !== undefined ? 108 : 50;
    this.besoin(Math.max(hauteurGauche, hauteurDroite) + 12);
    const haut = this.y;

    this.texte(options.phrase, MARGE, haut - 12, { taille: 8.3, couleur: GRIS });
    lettres.forEach((ligne, index) => this.texte(ligne, MARGE, haut - 28 - index * 13, { taille: 9.5, police: "italique" }));
    let yGauche = haut - 28 - lettres.length * 13;
    if (options.tampon) {
      this.tampon(options.tampon.titre, options.tampon.detail, MARGE + 24, yGauche - 66);
      yGauche -= 78;
    }

    let y = haut;
    if (options.regle !== undefined) {
      const ligne = (libelle: string, valeur: string, couleur: Couleur) => {
        this.texte(libelle, xDroite + 14, y - 17, { taille: 9, couleur: GRIS_FONCE });
        this.texte(valeur, LARGEUR - MARGE - 14, y - 17, { taille: 9.5, police: "gras", couleur, align: "droite" });
        y -= 27;
        this.filet(xDroite, y + 2, largeurDroite, TRAIT, 0.6);
      };
      ligne("Total facturé", xof(options.total), ENCRE);
      ligne("Déjà réglé", options.regle > 0 ? `- ${xof(options.regle)}` : xof(0), VERT);
      y -= 8;
      const reste = Math.max(options.total - options.regle, 0);
      this.rectangle(xDroite, y, largeurDroite, 46, { fond: reste === 0 ? VERT : ENCRE, rayon: 8 });
      this.texte(reste === 0 ? "FACTURE SOLDÉE" : "RESTE À PAYER", xDroite + 16, y - 27.5, { taille: 8.5, police: "gras", couleur: reste === 0 ? BLANC : OR });
      this.texte(xof(reste), LARGEUR - MARGE - 16, y - 29, { taille: 15, police: "gras", couleur: BLANC, align: "droite" });
      y -= 46;
    } else {
      this.rectangle(xDroite, y, largeurDroite, 50, { fond: ENCRE, rayon: 8 });
      this.texte("TOTAL", xDroite + 16, y - 29.5, { taille: 9, police: "gras", couleur: OR });
      this.texte(xof(options.total), LARGEUR - MARGE - 16, y - 31, { taille: 16, police: "gras", couleur: BLANC, align: "droite" });
      y -= 50;
    }
    this.texte("Montants exprimés en francs CFA (XOF)", LARGEUR - MARGE, y - 13, { taille: 7.3, couleur: GRIS, align: "droite" });
    this.y = Math.min(y - 13, yGauche) - 26;
  }

  private tampon(titre: string, detail: string, x: number, y: number) {
    const angle = 9;
    const radians = (angle * Math.PI) / 180;
    const largeur = 140;
    const hauteur = 50;
    const point = (dx: number, dy: number) => ({ x: x + dx * Math.cos(radians) - dy * Math.sin(radians), y: y + dx * Math.sin(radians) + dy * Math.cos(radians) });
    this.page.drawRectangle({ x, y, width: largeur, height: hauteur, borderColor: VERT, borderWidth: 2.2, rotate: degrees(angle), borderOpacity: 0.85 });
    const interieur = point(4, 4);
    this.page.drawRectangle({ x: interieur.x, y: interieur.y, width: largeur - 8, height: hauteur - 8, borderColor: VERT, borderWidth: 0.7, rotate: degrees(angle), borderOpacity: 0.85 });
    const propre = texteSur(titre);
    const titrePoint = point((largeur - this.largeur(propre, 19, "gras")) / 2, hauteur - 27);
    this.page.drawText(propre, { x: titrePoint.x, y: titrePoint.y, size: 19, font: this.polices.gras, color: VERT, rotate: degrees(angle), opacity: 0.9 });
    if (detail) {
      const sous = texteSur(detail);
      const sousPoint = point((largeur - this.largeur(sous, 8, "gras")) / 2, 11);
      this.page.drawText(sous, { x: sousPoint.x, y: sousPoint.y, size: 8, font: this.polices.gras, color: VERT, rotate: degrees(angle), opacity: 0.9 });
    }
  }

  reglements(liste: Paiement[]) {
    this.titre("Règlements reçus");
    const colonnes = [MARGE, MARGE + 78, MARGE + 176, MARGE + 318];
    const enTete = () => {
      ["DATE", "N° DE PAIEMENT", "MOYEN", "RÉFÉRENCE"].forEach((titre, index) => this.texte(titre, colonnes[index], this.y, { taille: 7, police: "gras", couleur: GRIS }));
      this.texte("MONTANT", LARGEUR - MARGE, this.y, { taille: 7, police: "gras", couleur: GRIS, align: "droite" });
      this.y -= 7;
      this.filet(MARGE, this.y, UTILE, ENCRE, 0.9);
      this.y -= 15;
    };
    this.besoin(40);
    enTete();
    for (const paiement of liste) {
      if (this.besoin(20)) enTete();
      this.texte(formatJour(paiement.date), colonnes[0], this.y, { taille: 8.8 });
      this.texte(paiement.numero, colonnes[1], this.y, { taille: 8.8 });
      this.texte(this.tronquer(paiement.mode, 136, 8.8), colonnes[2], this.y, { taille: 8.8 });
      this.texte(this.tronquer(paiement.reference || "—", 90, 8.8), colonnes[3], this.y, { taille: 8.8, couleur: GRIS_FONCE });
      this.texte(xof(paiement.montant), LARGEUR - MARGE, this.y, { taille: 8.8, police: "gras", couleur: VERT, align: "droite" });
      this.y -= 8;
      this.filet(MARGE, this.y, UTILE, TRAIT, 0.5);
      this.y -= 13;
    }
    this.y -= 12;
  }

  private titre(texte: string) {
    this.besoin(34);
    this.texte(texte.toUpperCase(), MARGE, this.y, { taille: 8, police: "gras" });
    this.page.drawRectangle({ x: MARGE, y: this.y - 6, width: 18, height: 2, color: OR });
    this.y -= 22;
  }

  /** Une ou deux rubriques de texte, côte à côte quand il y en a deux. */
  rubriques(liste: { titre: string; texte: string }[]) {
    const remplies = liste.filter((rubrique) => rubrique.texte.trim());
    if (remplies.length === 0) return;
    const ecart = 24;
    const largeur = remplies.length === 2 ? (UTILE - ecart) / 2 : UTILE;
    const contenus = remplies.map((rubrique) => this.couper(rubrique.texte, largeur, 8.6));
    const hauteur = 22 + Math.max(...contenus.map((lignes) => lignes.length)) * 12;
    if (hauteur < HAUTEUR - 2 * PIED) this.besoin(hauteur + 8);
    const haut = this.y;
    remplies.forEach((rubrique, index) => {
      const x = MARGE + index * (largeur + ecart);
      this.texte(rubrique.titre.toUpperCase(), x, haut, { taille: 8, police: "gras" });
      this.page.drawRectangle({ x, y: haut - 6, width: 18, height: 2, color: OR });
      contenus[index].forEach((ligne, rang) => this.texte(ligne, x, haut - 22 - rang * 12, { taille: 8.6, couleur: GRIS_FONCE }));
    });
    this.y = haut - hauteur - 14;
  }

  signatures(cases: { titre: string; detail: string }[]) {
    const hauteur = 96;
    const ecart = 18;
    const largeur = (UTILE - ecart) / 2;
    this.besoin(hauteur + 8);
    cases.forEach((carre, index) => {
      const x = MARGE + index * (largeur + ecart);
      this.rectangle(x, this.y, largeur, hauteur, { bord: TRAIT, rayon: 8 });
      this.texte(carre.titre, x + 14, this.y - 20, { taille: 8.8, police: "gras" });
      this.texte(this.tronquer(carre.detail, largeur - 28, 7.8), x + 14, this.y - 33, { taille: 7.8, couleur: GRIS });
    });
    this.y -= hauteur + 16;
  }

  private filigrane(texte: string) {
    const taille = 92;
    const radians = (35 * Math.PI) / 180;
    const propre = texteSur(texte);
    const largeur = this.largeur(propre, taille, "gras");
    const x = LARGEUR / 2 - (largeur / 2) * Math.cos(radians) + taille * 0.35 * Math.sin(radians);
    const y = HAUTEUR / 2 - (largeur / 2) * Math.sin(radians) - taille * 0.35 * Math.cos(radians);
    this.page.drawText(propre, { x, y, size: taille, font: this.polices.gras, color: ROUGE, rotate: degrees(35), opacity: 0.1 });
  }

  mentions(premiere?: string) {
    const entreprise = this.entreprise;
    const legales = [entreprise.nom, entreprise.adresse, entreprise.rccm && `RCCM ${entreprise.rccm}`, entreprise.ncc && `NCC ${entreprise.ncc}`].filter(Boolean).join("  ·  ");
    return [premiere, legales].filter(Boolean) as string[];
  }

  async terminer(lignes: string[], filigrane?: string) {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      this.page = page;
      if (filigrane) this.filigrane(filigrane);
      this.filet(MARGE, 58, UTILE, TRAIT, 0.7);
      lignes.slice(0, 2).forEach((ligne, rang) => this.texte(this.tronquer(ligne, UTILE - 70, 7.5), MARGE, 44 - rang * 10.5, { taille: 7.5, couleur: GRIS }));
      this.texte(`Page ${index + 1} / ${pages.length}`, LARGEUR - MARGE, 44, { taille: 7.5, couleur: GRIS, align: "droite" });
    });
    return Buffer.from(await this.doc.save());
  }
}

function auteur(personne: { prenom: string; nom: string } | null | undefined) {
  return personne ? nomComplet(personne) : "—";
}

export async function pdfDevis(devisId: string): Promise<FichierPdf | null> {
  const devis = await prisma.devis.findUnique({
    where: { id: devisId },
    include: { dossier: { include: { client: true, procedure: true } }, facture: { select: { numero: true } } },
  });
  if (!devis) return null;
  const conseiller = await prisma.user.findUnique({ where: { id: devis.creeParId }, select: { prenom: true, nom: true } });
  const client = devis.dossier.client;
  const pdf = await Gabarit.creer("Devis", devis.numero, `Devis ${devis.numero} – ${devis.clientNom}`, devis.objet);

  pdf.premierePage(etatDevis(devis));
  pdf.blocs(
    { titre: "Client", nom: devis.clientNom, lignes: [client.telephone, client.email ?? "", `Destination : ${devis.dossier.procedure.destination}`] },
    [
      ["Date du devis", formatJour(devis.creeLe)],
      ["Valable jusqu'au", devis.validiteLe ? formatJour(devis.validiteLe) : "—"],
      ["Dossier", devis.dossier.reference],
      ["Prestation", devis.dossier.procedure.nom],
      ["Conseiller", auteur(conseiller)],
    ],
  );
  pdf.objet(devis.objet);
  pdf.tableau(lireLignes(devis.lignes));
  pdf.totaux({ total: devis.total, phrase: "Arrêté le présent devis à la somme de :" });
  pdf.rubriques([
    { titre: "Conditions", texte: devis.conditions ?? "" },
    { titre: "Modalités de paiement", texte: pdf.entreprise.modalitesPaiement },
  ]);
  pdf.signatures([
    { titre: `Pour ${pdf.entreprise.nom}`, detail: `${auteur(conseiller)} · signature et cachet` },
    { titre: "Bon pour accord — le client", detail: "Date et signature précédées de « Lu et approuvé »" },
  ]);
  const validite = devis.validiteLe ? `Devis valable jusqu'au ${formatJour(devis.validiteLe)}` : "Devis";
  return { nom: `Devis-${devis.numero}.pdf`, octets: await pdf.terminer(pdf.mentions(`${validite} · ce document n'a pas valeur de facture.`)) };
}

export async function pdfFacture(factureId: string): Promise<FichierPdf | null> {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: {
      paiement: true,
      reglements: { orderBy: { dateEncaissement: "asc" } },
      devis: { select: { numero: true } },
      dossier: { include: { client: true, procedure: true } },
    },
  });
  if (!facture) return null;
  const auteurId = facture.creeParId ?? facture.paiement?.saisiParId ?? null;
  const conseiller = auteurId ? await prisma.user.findUnique({ where: { id: auteurId }, select: { prenom: true, nom: true } }) : null;
  const client = facture.dossier.client;
  const paiements = (facture.paiement ? [facture.paiement] : facture.reglements).map((paiement) => ({
    date: paiement.dateEncaissement,
    numero: paiement.numero,
    mode: `${labelMode(paiement.mode)}${paiement.precision ? ` · ${paiement.precision}` : ""}`,
    reference: paiement.referenceExterne,
    montant: paiement.montant,
  }));
  const regle = paiements.reduce((somme, paiement) => somme + paiement.montant, 0);
  const etat = etatFacture({ montant: facture.montant, regle, annuleeLe: facture.annuleeLe, echeanceLe: facture.echeanceLe });
  const lignes = facture.lignes ? lireLignes(facture.lignes) : [{ libelle: facture.libelle, quantite: 1, prixUnitaire: facture.montant }];
  const pdf = await Gabarit.creer("Facture", facture.numero, `Facture ${facture.numero} – ${facture.clientNom}`, facture.libelle);

  const details: [string, string][] = [["Date d'émission", formatJour(facture.creeLe)]];
  if (facture.paiement) details.push(["Paiement", facture.paiement.numero]);
  else details.push(["Échéance", facture.echeanceLe ? formatJour(facture.echeanceLe) : "À réception"]);
  details.push(["Dossier", facture.dossier.reference]);
  if (facture.devis) details.push(["Devis d'origine", facture.devis.numero]);
  else details.push(["Prestation", facture.dossier.procedure.nom]);
  details.push(["Conseiller", auteur(conseiller)]);

  pdf.premierePage(etat);
  pdf.blocs({ titre: "Facturé à", nom: facture.clientNom, lignes: [client.telephone, client.email ?? "", `Destination : ${facture.dossier.procedure.destination}`] }, details);
  pdf.objet(facture.libelle);
  pdf.tableau(lignes);
  const dernier = paiements[paiements.length - 1];
  pdf.totaux({
    total: facture.montant,
    regle,
    phrase: "Arrêtée la présente facture à la somme de :",
    tampon: etat.code === "PAYEE" ? { titre: "PAYÉE", detail: dernier ? `le ${formatJour(dernier.date)}` : "" } : undefined,
  });
  if (paiements.length) pdf.reglements(paiements);
  if (facture.annuleeLe) {
    pdf.rubriques([{ titre: "Facture annulée", texte: `Annulée le ${formatJour(facture.annuleeLe)}${facture.motifAnnulation ? ` : ${facture.motifAnnulation}` : "."}` }]);
  } else {
    pdf.rubriques([
      { titre: "Conditions", texte: facture.conditions ?? "" },
      { titre: "Modalités de paiement", texte: regle < facture.montant ? pdf.entreprise.modalitesPaiement : "" },
    ]);
  }
  const octets = await pdf.terminer(pdf.mentions(pdf.entreprise.mentionFacture || undefined), facture.annuleeLe ? "ANNULÉE" : undefined);
  return { nom: `Facture-${facture.numero}.pdf`, octets };
}

export async function pieceJointe(reference: string | null | undefined): Promise<FichierPdf | null> {
  if (!reference) return null;
  const [type, id] = reference.split(":");
  if (type === "facture" && id) return pdfFacture(id);
  if (type === "devis" && id) return pdfDevis(id);
  return null;
}
