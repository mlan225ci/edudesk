import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { lireEntreprise, type Entreprise } from "./parametres";

const ENCRE = rgb(0x14 / 255, 0x28 / 255, 0x4b / 255);
const OR = rgb(0xf2 / 255, 0xb7 / 255, 0x05 / 255);
const PAPIER = rgb(0xf6 / 255, 0xf5 / 255, 0xf1 / 255);
const VERT = rgb(0x1f / 255, 0x8a / 255, 0x5b / 255);
const GRIS = rgb(0.45, 0.48, 0.55);
const TRAIT = rgb(0.86, 0.87, 0.9);
const BLANC = rgb(1, 1, 1);

const LARGEUR = 595.28;
const HAUTEUR = 841.89;
const MARGE = 48;

const WIN_ANSI_HORS_LATIN1 = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

export function texteSur(valeur: string) {
  return valeur
    .replace(/[\u202f\u2009\u2007\u00a0]/g, " ")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/\r/g, "")
    .split("")
    .filter((c) => c === "\n" || (c >= " " && c.charCodeAt(0) <= 0xff) || WIN_ANSI_HORS_LATIN1.includes(c))
    .join("");
}

export type Colonne = { titre: string; largeur: number; droite?: boolean };

export class DocumentPdf {
  private constructor(
    readonly doc: PDFDocument,
    private normal: PDFFont,
    private gras: PDFFont,
    private logo: PDFImage | null,
    readonly entreprise: Entreprise,
  ) {}

  page!: PDFPage;
  y = 0;

  static async creer() {
    const doc = await PDFDocument.create();
    const normal = await doc.embedFont(StandardFonts.Helvetica);
    const gras = await doc.embedFont(StandardFonts.HelveticaBold);
    const octets = await readFile(path.join(process.cwd(), "public", "logo-pdf.png")).catch(() => null);
    const logo = octets ? await doc.embedPng(octets).catch(() => null) : null;
    const entreprise = await lireEntreprise();
    doc.setProducer(entreprise.nom);
    doc.setCreator(entreprise.nom);
    return new DocumentPdf(doc, normal, gras, logo, entreprise);
  }

  largeurTexte(texte: string, taille: number, gras = false) {
    return (gras ? this.gras : this.normal).widthOfTextAtSize(texteSur(texte), taille);
  }

  ecrire(texte: string, x: number, y: number, options: { taille?: number; gras?: boolean; couleur?: ReturnType<typeof rgb>; droite?: boolean } = {}) {
    const taille = options.taille ?? 10;
    const propre = texteSur(texte);
    const largeur = this.largeurTexte(propre, taille, options.gras);
    this.page.drawText(propre, {
      x: options.droite ? x - largeur : x,
      y,
      size: taille,
      font: options.gras ? this.gras : this.normal,
      color: options.couleur ?? ENCRE,
    });
  }

  couper(texte: string, largeurMax: number, taille: number, gras = false) {
    const lignes: string[] = [];
    for (const paragraphe of texteSur(texte).split("\n")) {
      let courante = "";
      for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
        const essai = courante ? `${courante} ${mot}` : mot;
        if (this.largeurTexte(essai, taille, gras) > largeurMax && courante) {
          lignes.push(courante);
          courante = mot;
        } else courante = essai;
      }
      lignes.push(courante);
    }
    return lignes;
  }

  nouvellePage() {
    this.page = this.doc.addPage([LARGEUR, HAUTEUR]);
    this.y = HAUTEUR - MARGE;
  }

  besoin(hauteur: number) {
    if (this.y - hauteur < MARGE + 40) this.nouvellePage();
  }

  entete(type: string, numero: string, sousTitre: string) {
    this.nouvellePage();
    const hauteur = 118;
    this.page.drawRectangle({ x: 0, y: HAUTEUR - hauteur, width: LARGEUR, height: hauteur, color: ENCRE });
    let yGauche = HAUTEUR - 40;
    if (this.logo) {
      const dims = this.logo.scaleToFit(150, 36);
      this.page.drawImage(this.logo, { x: MARGE, y: HAUTEUR - 34 - dims.height, width: dims.width, height: dims.height });
      yGauche = HAUTEUR - 34 - dims.height - 16;
    } else {
      this.ecrire(this.entreprise.nom, MARGE, yGauche - 8, { taille: 20, gras: true, couleur: BLANC });
      yGauche -= 26;
    }
    this.ecrire(this.entreprise.slogan || this.entreprise.nom, MARGE, yGauche, { taille: 9, couleur: rgb(0.8, 0.83, 0.9) });
    const coordonnees = [this.entreprise.adresse, this.entreprise.telephone, this.entreprise.email, this.entreprise.siteWeb].filter(Boolean).join(" · ");
    if (coordonnees) {
      const lignes = this.couper(coordonnees, 280, 7.5);
      lignes.slice(0, 2).forEach((ligne, index) => this.ecrire(ligne, MARGE, yGauche - 12 - index * 10, { taille: 7.5, couleur: rgb(0.65, 0.7, 0.8) }));
    }
    const droite = LARGEUR - MARGE;
    this.ecrire(type.toUpperCase(), droite, HAUTEUR - 42, { taille: 8.5, gras: true, couleur: OR, droite: true });
    this.ecrire(numero, droite, HAUTEUR - 64, { taille: 18, gras: true, couleur: BLANC, droite: true });
    this.ecrire(sousTitre, droite, HAUTEUR - 82, { taille: 9, couleur: rgb(0.8, 0.83, 0.9), droite: true });
    this.y = HAUTEUR - hauteur - 34;
  }

  deuxBlocs(gauche: { titre: string; lignes: string[] }, droite: { titre: string; lignes: string[] }) {
    const xDroite = LARGEUR - MARGE;
    this.ecrire(gauche.titre.toUpperCase(), MARGE, this.y, { taille: 7.5, gras: true, couleur: GRIS });
    this.ecrire(droite.titre.toUpperCase(), xDroite, this.y, { taille: 7.5, gras: true, couleur: GRIS, droite: true });
    let yG = this.y - 17;
    gauche.lignes.forEach((ligne, index) => {
      this.ecrire(ligne, MARGE, yG, { taille: index === 0 ? 13 : 9.5, gras: index === 0, couleur: index === 0 ? ENCRE : GRIS });
      yG -= index === 0 ? 15 : 12.5;
    });
    let yD = this.y - 17;
    droite.lignes.forEach((ligne, index) => {
      this.ecrire(ligne, xDroite, yD, { taille: index === 0 ? 11 : 9.5, gras: index === 0, couleur: index === 0 ? ENCRE : GRIS, droite: true });
      yD -= index === 0 ? 15 : 12.5;
    });
    this.y = Math.min(yG, yD) - 22;
  }

  titreSection(texte: string) {
    this.besoin(40);
    this.ecrire(texte, MARGE, this.y, { taille: 12, gras: true });
    this.y -= 8;
    this.page.drawRectangle({ x: MARGE, y: this.y, width: 28, height: 2, color: OR });
    this.y -= 18;
  }

  paragraphe(texte: string, options: { taille?: number; couleur?: ReturnType<typeof rgb> } = {}) {
    const taille = options.taille ?? 9.5;
    for (const ligne of this.couper(texte, LARGEUR - 2 * MARGE, taille)) {
      this.besoin(taille + 4);
      this.ecrire(ligne, MARGE, this.y, { taille, couleur: options.couleur ?? ENCRE });
      this.y -= taille + 4;
    }
    this.y -= 6;
  }

  tableau(colonnes: Colonne[], lignes: string[][], options: { taille?: number } = {}) {
    const taille = options.taille ?? 9.5;
    const total = colonnes.reduce((somme, col) => somme + col.largeur, 0);
    const utile = LARGEUR - 2 * MARGE;
    const largeurs = colonnes.map((col) => (col.largeur / total) * utile);
    const enTete = () => {
      this.besoin(40);
      let x = MARGE;
      colonnes.forEach((col, index) => {
        const xTexte = col.droite ? x + largeurs[index] - 4 : x + (index === 0 ? 0 : 4);
        this.ecrire(col.titre.toUpperCase(), xTexte, this.y, { taille: 7.5, gras: true, droite: col.droite });
        x += largeurs[index];
      });
      this.y -= 7;
      this.page.drawRectangle({ x: MARGE, y: this.y, width: utile, height: 1.5, color: ENCRE });
      this.y -= 15;
    };
    enTete();
    for (const ligne of lignes) {
      const cellules = ligne.map((cellule, index) => this.couper(cellule ?? "", largeurs[index] - 8, taille, index === 0));
      const hauteur = Math.max(...cellules.map((c) => c.length)) * (taille + 3.5);
      if (this.y - hauteur < MARGE + 40) {
        this.nouvellePage();
        enTete();
      }
      let x = MARGE;
      cellules.forEach((morceaux, index) => {
        const col = colonnes[index];
        morceaux.forEach((morceau, rang) => {
          const xTexte = col.droite ? x + largeurs[index] - 4 : x + (index === 0 ? 0 : 4);
          this.ecrire(morceau, xTexte, this.y - rang * (taille + 3.5), { taille, gras: index === 0, droite: col.droite });
        });
        x += largeurs[index];
      });
      this.y -= hauteur + 4;
      this.page.drawRectangle({ x: MARGE, y: this.y + 4, width: utile, height: 0.6, color: TRAIT });
      this.y -= 8;
    }
    this.y -= 6;
  }

  encadreTotal(libelle: string, valeur: string, note?: { texte: string; vert?: boolean }) {
    this.besoin(70);
    const largeur = 230;
    const x = LARGEUR - MARGE - largeur;
    this.page.drawRectangle({ x, y: this.y - 34, width: largeur, height: 42, color: PAPIER });
    this.ecrire(libelle, x + 16, this.y - 17, { taille: 10.5, gras: true });
    this.ecrire(valeur, x + largeur - 16, this.y - 18, { taille: 14, gras: true, droite: true });
    this.y -= 54;
    if (note) {
      this.ecrire(note.texte, LARGEUR - MARGE, this.y, { taille: 9.5, gras: true, couleur: note.vert ? VERT : GRIS, droite: true });
      this.y -= 22;
    }
  }

  cartesKpi(cartes: { libelle: string; valeur: string; detail?: string }[]) {
    const parLigne = 3;
    const ecart = 10;
    const largeur = (LARGEUR - 2 * MARGE - ecart * (parLigne - 1)) / parLigne;
    for (let i = 0; i < cartes.length; i += parLigne) {
      this.besoin(66);
      cartes.slice(i, i + parLigne).forEach((carte, index) => {
        const x = MARGE + index * (largeur + ecart);
        this.page.drawRectangle({ x, y: this.y - 50, width: largeur, height: 58, color: PAPIER });
        this.ecrire(carte.libelle.toUpperCase(), x + 10, this.y - 8, { taille: 7, gras: true, couleur: GRIS });
        this.ecrire(carte.valeur, x + 10, this.y - 28, { taille: 15, gras: true });
        if (carte.detail) this.ecrire(carte.detail, x + 10, this.y - 42, { taille: 7.5, couleur: GRIS });
      });
      this.y -= 68;
    }
    this.y -= 6;
  }

  async terminer(mentions: string[]) {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      this.page = page;
      page.drawRectangle({ x: MARGE, y: 46, width: LARGEUR - 2 * MARGE, height: 0.6, color: TRAIT });
      mentions.slice(0, 2).forEach((ligne, rang) => this.ecrire(ligne, MARGE, 34 - rang * 10, { taille: 7.5, couleur: GRIS }));
      this.ecrire(`${index + 1} / ${pages.length}`, LARGEUR - MARGE, 34, { taille: 7.5, couleur: GRIS, droite: true });
    });
    return Buffer.from(await this.doc.save());
  }

  mentionsLegales(premiere?: string) {
    const legales = [this.entreprise.rccm && `RCCM ${this.entreprise.rccm}`, this.entreprise.ncc && `NCC ${this.entreprise.ncc}`].filter(Boolean);
    return [premiere, [this.entreprise.nom, ...legales].join(" · ")].filter(Boolean) as string[];
  }
}

export type FichierPdf = { nom: string; octets: Buffer };
