"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Hash, Loader2, Mic, Paperclip, RotateCcw, Send, Square, Trash2, Upload, Users } from "lucide-react";
import { Formulaire } from "@/components/formulaire";
import { EVENEMENT_FLUX, definirConversationOuverte, enLecture, type EvenementClient } from "@/components/centre-messages";
import { AvatarPresence, ContenuFichier, ListeContacts, type Contact } from "@/components/messagerie";
import { envoyerMessageGroupe, inviterDansGroupe } from "@/server/groupes-actions";
import { decouperGroupe, jetonEnCours } from "@/lib/mentions-groupe";
import { formatDate } from "@/lib/format";
import { apercuMessage, dureeTexte, type DossierMention } from "@/lib/messages";
import type { MessageGroupeVue } from "@/server/groupes";

type Membre = { id: string; nom: string };
type Collegue = { id: string; nom: string };
type GroupeListe = { id: string; nom: string; general: boolean; client: string | null; nonLus: number; apercu: string | null };
type Ligne = MessageGroupeVue & { etat?: "envoi" | "echec" };
type EnvoiFichier = { fichier: File; texte: string; duree: number | null };

const TAILLE_MAX = 10 * 1024 * 1024;
const DUREE_MAX_VOCAL = 300;
const FORMATS_AUDIO: [string, string][] = [
  ["audio/webm;codecs=opus", ".webm"],
  ["audio/webm", ".webm"],
  ["audio/ogg;codecs=opus", ".ogg"],
  ["audio/mp4", ".m4a"],
];

function nouvelleCle() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function ListeGroupes({ groupes, actifId, moiId }: { groupes: GroupeListe[]; actifId: string | null; moiId: string }) {
  const [lignes, setLignes] = useState(groupes);
  useEffect(() => setLignes(groupes), [groupes]);
  useEffect(() => {
    const recevoir = (event: Event) => {
      const detail = (event as CustomEvent<EvenementClient>).detail;
      if (detail.type !== "groupe") return;
      const apercu = apercuMessage(detail.message).replace(/\s+/g, " ").trim().slice(0, 80);
      const prefixe = detail.message.deId === moiId ? "Vous" : detail.message.deNom.split(" ")[0] || detail.message.deNom;
      setLignes((actuels) =>
        actuels.map((groupe) =>
          groupe.id === detail.groupeId
            ? {
                ...groupe,
                apercu: apercu ? `${prefixe} : ${apercu}` : groupe.apercu,
                nonLus: detail.message.deId === moiId || groupe.id === actifId ? groupe.nonLus : groupe.nonLus + 1,
              }
            : groupe,
        ),
      );
    };
    window.addEventListener(EVENEMENT_FLUX, recevoir);
    return () => window.removeEventListener(EVENEMENT_FLUX, recevoir);
  }, [moiId, actifId]);

  if (lignes.length === 0) return null;
  return (
    <div className="carte mb-3 p-2">
      <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-ink/45 uppercase">Groupes</p>
      <nav aria-label="Groupes" className="grid">
        {lignes.map((groupe) => {
          const actif = groupe.id === actifId;
          const nombre = actif ? 0 : groupe.nonLus;
          return (
            <Link key={groupe.id} href={`/messages?groupe=${groupe.id}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${actif ? "bg-desk/[0.08]" : "hover:bg-paper"}`}>
              {groupe.general ? (
                <img src="/icon.png" alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-desk/10 text-desk">
                  <Users size={16} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${nombre ? "font-bold" : "font-semibold"}`}>{groupe.nom}</span>
                  {nombre ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-desk px-1.5 text-[11px] font-bold text-white">{nombre}</span> : null}
                </span>
                <span className="block truncate text-xs text-ink/45">{groupe.apercu ?? (groupe.general ? "Tous les collaborateurs" : groupe.client)}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function ConversationGroupe({
  moiId,
  groupe,
  messages,
  collegues,
}: {
  moiId: string;
  groupe: { id: string; nom: string; general: boolean; client: { id: string; nom: string } | null; membres: Membre[] };
  messages: MessageGroupeVue[];
  collegues: Collegue[];
}) {
  const [fil, setFil] = useState<Ligne[]>(messages);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [jeton, setJeton] = useState<ReturnType<typeof jetonEnCours>>(null);
  const [dossiers, setDossiers] = useState<DossierMention[]>([]);
  const [choix, setChoix] = useState(0);
  const [survol, setSurvol] = useState(false);
  const [enregistre, setEnregistre] = useState<number | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const champ = useRef<HTMLTextAreaElement>(null);
  const selecteur = useRef<HTMLInputElement>(null);
  const bas = useRef<HTMLDivElement>(null);
  const envoisFichiers = useRef(new Map<string, EnvoiFichier>());
  const enregistrement = useRef<{ enregistreur: MediaRecorder; flux: MediaStream; debut: number; annule: boolean } | null>(null);
  const noms = groupe.membres.map((membre) => membre.nom);
  const absents = collegues.filter((collegue) => !groupe.membres.some((membre) => membre.id === collegue.id));

  useEffect(() => setFil(messages), [messages]);
  useEffect(() => {
    definirConversationOuverte(`groupe:${groupe.id}`);
    return () => definirConversationOuverte(null);
  }, [groupe.id]);
  useEffect(() => {
    bas.current?.scrollIntoView({ block: "end" });
  }, [fil.length]);

  useEffect(() => {
    const recevoir = (event: Event) => {
      const detail = (event as CustomEvent<EvenementClient>).detail;
      if (detail.type !== "groupe" || detail.groupeId !== groupe.id) return;
      const message = detail.message;
      setFil((actuels) => {
        if (actuels.some((ligne) => ligne.id === message.id)) return actuels;
        return [...actuels.filter((ligne) => !(message.cle && ligne.cle === message.cle)), message];
      });
    };
    window.addEventListener(EVENEMENT_FLUX, recevoir);
    return () => window.removeEventListener(EVENEMENT_FLUX, recevoir);
  }, [groupe.id]);

  useEffect(() => {
    if (!jeton || jeton.signe !== "#") return;
    const controleur = new AbortController();
    const minuteur = window.setTimeout(() => {
      fetch(`/api/messages/dossiers?q=${encodeURIComponent(jeton.requete)}`, { signal: controleur.signal })
        .then((reponse) => (reponse.ok ? reponse.json() : Promise.reject()))
        .then((donnees: { dossiers: DossierMention[] }) => {
          setDossiers(donnees.dossiers);
          setChoix(0);
        })
        .catch(() => undefined);
    }, 180);
    return () => {
      window.clearTimeout(minuteur);
      controleur.abort();
    };
  }, [jeton]);

  const personnes = jeton?.signe === "@"
    ? groupe.membres.filter((membre) => membre.nom.toLocaleLowerCase("fr").includes(jeton.requete.trim().toLocaleLowerCase("fr"))).slice(0, 8)
    : [];
  const suggestionsDossiers = jeton?.signe === "#" ? dossiers : [];

  function detecter() {
    const element = champ.current;
    if (!element) return;
    setJeton(jetonEnCours(element.value, element.selectionStart ?? element.value.length));
  }

  function inserer(morceau: string) {
    const element = champ.current;
    const courant = jeton;
    if (!element || !courant) return;
    const fin = element.selectionStart ?? element.value.length;
    const suite = `${element.value.slice(0, courant.debut)}${morceau}${element.value.slice(fin)}`;
    setTexte(suite);
    setJeton(null);
    const place = courant.debut + morceau.length;
    window.setTimeout(() => {
      element.focus();
      element.setSelectionRange(place, place);
    }, 0);
  }

  async function envoyer() {
    const valeur = texte.trim();
    if (!valeur || envoi) return;
    setTexte("");
    setJeton(null);
    setEnvoi(true);
    setErreur("");
    const resultat = await envoyerMessageGroupe(groupe.id, valeur);
    setEnvoi(false);
    if ("error" in resultat) {
      setTexte(valeur);
      setErreur(resultat.error);
      return;
    }
    setFil((actuels) => (actuels.some((ligne) => ligne.id === resultat.message.id) ? actuels : [...actuels, resultat.message]));
  }

  const expedierFichier = async (envoiFichier: EnvoiFichier, cle = nouvelleCle()) => {
    envoisFichiers.current.set(cle, envoiFichier);
    const brouillon: Ligne = {
      id: `brouillon-${cle}`,
      cle,
      deId: moiId,
      deNom: "",
      texte: envoiFichier.texte,
      creeLe: new Date().toISOString(),
      fichier: {
        nom: envoiFichier.fichier.name,
        type: envoiFichier.fichier.type || "application/octet-stream",
        taille: envoiFichier.fichier.size,
        duree: envoiFichier.duree,
      },
      etat: "envoi",
    };
    setFil((actuels) => [...actuels.filter((ligne) => ligne.cle !== cle), brouillon]);
    const formulaire = new FormData();
    formulaire.set("fichier", envoiFichier.fichier);
    formulaire.set("groupeId", groupe.id);
    formulaire.set("texte", envoiFichier.texte);
    formulaire.set("cle", cle);
    if (envoiFichier.duree != null) formulaire.set("duree", String(envoiFichier.duree));
    const retour = await fetch("/api/messages/fichier", { method: "POST", body: formulaire }).catch(() => null);
    const donnees = retour ? ((await retour.json().catch(() => null)) as { message?: MessageGroupeVue; error?: string } | null) : null;
    if (!retour?.ok || !donnees?.message) {
      setFil((actuels) => actuels.map((ligne) => (ligne.cle === cle && ligne.etat ? { ...ligne, etat: "echec" } : ligne)));
      setErreur(donnees?.error ?? "Envoi du fichier impossible. Vérifiez la connexion.");
      return;
    }
    envoisFichiers.current.delete(cle);
    const message = donnees.message;
    setFil((actuels) => [...actuels.filter((ligne) => ligne.id !== message.id && ligne.cle !== cle), message]);
  };

  const envoyerFichiers = (fichiers: FileList | File[]) => {
    const liste = [...fichiers].slice(0, 10);
    if (liste.length === 0) return;
    const tropGros = liste.find((fichier) => fichier.size > TAILLE_MAX);
    if (tropGros) {
      setErreur(`« ${tropGros.name} » dépasse 10 Mo.`);
      return;
    }
    const legende = texte.trim();
    setTexte("");
    setJeton(null);
    setErreur("");
    liste.forEach((fichier, index) => void expedierFichier({ fichier, texte: index === 0 ? legende : "", duree: null }));
  };

  const reessayer = (ligne: Ligne) => {
    if (!ligne.cle) return;
    const conserve = envoisFichiers.current.get(ligne.cle);
    if (conserve) void expedierFichier(conserve, ligne.cle);
  };

  const arreterEnregistrement = useCallback((annuler: boolean) => {
    const etat = enregistrement.current;
    if (!etat) return;
    etat.annule = annuler;
    if (etat.enregistreur.state !== "inactive") etat.enregistreur.stop();
  }, []);

  const demarrerEnregistrement = async () => {
    if (enregistrement.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErreur("Enregistrement audio indisponible ici : il faut un navigateur récent et une adresse sécurisée (https ou localhost).");
      return;
    }
    let flux: MediaStream;
    try {
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErreur("Micro refusé ou introuvable. Autorisez le micro pour ce site dans le navigateur.");
      return;
    }
    const format = FORMATS_AUDIO.find(([type]) => MediaRecorder.isTypeSupported(type));
    const enregistreur = new MediaRecorder(flux, format ? { mimeType: format[0] } : undefined);
    const morceaux: Blob[] = [];
    const debut = Date.now();
    enregistrement.current = { enregistreur, flux, debut, annule: false };
    enregistreur.ondataavailable = (event) => {
      if (event.data.size > 0) morceaux.push(event.data);
    };
    enregistreur.onstop = () => {
      flux.getTracks().forEach((piste) => piste.stop());
      const etat = enregistrement.current;
      enregistrement.current = null;
      setEnregistre(null);
      if (!etat || etat.annule) return;
      const duree = Math.round((Date.now() - debut) / 1000);
      if (duree < 1) {
        setErreur("Note vocale trop courte : maintenez l'enregistrement au moins une seconde.");
        return;
      }
      const type = enregistreur.mimeType || format?.[0] || "audio/webm";
      const extension = format?.[1] ?? (type.includes("mp4") ? ".m4a" : type.includes("ogg") ? ".ogg" : ".webm");
      const blob = new Blob(morceaux, { type: type.split(";")[0] });
      setErreur("");
      void expedierFichier({ fichier: new File([blob], `Note vocale${extension}`, { type: blob.type }), texte: "", duree });
    };
    enregistreur.start(250);
    setMaintenant(debut);
    setEnregistre(debut);
  };

  useEffect(() => {
    if (enregistre == null) return;
    const minuteur = window.setInterval(() => {
      const instant = Date.now();
      setMaintenant(instant);
      if (instant - enregistre >= DUREE_MAX_VOCAL * 1000) arreterEnregistrement(false);
    }, 250);
    return () => window.clearInterval(minuteur);
  }, [enregistre, arreterEnregistrement]);

  useEffect(() => () => arreterEnregistrement(true), [arreterEnregistrement]);

  return (
    <article
      className="carte relative flex min-h-[70vh] flex-col overflow-hidden p-0"
      onDragOver={(event) => {
        if (![...event.dataTransfer.types].includes("Files")) return;
        event.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSurvol(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setSurvol(false);
        envoyerFichiers(event.dataTransfer.files);
      }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-ink/[0.06] px-5 py-4">
        {groupe.general ? (
          <img src="/icon.png" alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-desk/10 text-desk">
            <Users size={18} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{groupe.nom}</p>
          <p className="truncate text-xs text-ink/50">
            {groupe.general ? "Tous les collaborateurs" : `${groupe.membres.length} participant${groupe.membres.length > 1 ? "s" : ""}`}
            {groupe.client ? (
              <>
                {" "}
                · <Link href={`/clients/${groupe.client.id}`} className="font-semibold text-desk hover:underline">{groupe.client.nom}</Link>
              </>
            ) : null}
          </p>
        </div>
      </header>

      {!groupe.general && absents.length > 0 ? (
        <details className="border-b border-ink/[0.06] px-5 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink/70">Ajouter un collègue</summary>
          <Formulaire action={inviterDansGroupe} submit="Ajouter" succes="Collègues ajoutés" className="mt-3 grid gap-3">
            <input type="hidden" name="groupeId" value={groupe.id} />
            <div className="grid max-h-36 gap-1 overflow-y-auto">
              {absents.map((collegue) => (
                <label key={collegue.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-paper">
                  <input type="checkbox" name="membre" value={collegue.id} />
                  <span>{collegue.nom}</span>
                </label>
              ))}
            </div>
          </Formulaire>
        </details>
      ) : null}

      <div className="flex h-[52vh] min-h-72 flex-col gap-2 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
        {fil.length === 0 ? <p className="m-auto text-sm text-ink/45">Aucun message. Écrivez, joignez un fichier ou enregistrez une note vocale. @ mentionne un collègue, # un dossier.</p> : null}
        {fil.map((message) => {
          const moi = message.deId === moiId;
          return (
            <div key={message.cle && message.etat ? message.cle : message.id} className={`flex ${moi ? "justify-end" : "justify-start"}`}>
              <div className={`grid max-w-[78%] gap-1 rounded-2xl px-3.5 py-2 text-sm ${message.etat === "echec" ? "rounded-br-md bg-cap/90 text-white" : moi ? "rounded-br-md bg-desk text-white" : "rounded-bl-md bg-paper"} ${message.etat === "envoi" ? "opacity-70" : ""}`}>
                {moi || message.etat ? null : <p className="text-xs font-semibold text-desk">{message.deNom}</p>}
                {message.fichier ? <ContenuFichier message={message} moi={moi || message.etat === "echec"} /> : null}
                {message.texte ? (
                  <p className="whitespace-pre-line break-words">
                    <TexteGroupe texte={message.texte} noms={noms} membres={groupe.membres} moi={moi || message.etat === "echec"} />
                  </p>
                ) : null}
                <p className={`flex items-center justify-end gap-1 text-right text-[11px] ${moi || message.etat === "echec" ? "text-white/65" : "text-ink/40"}`} suppressHydrationWarning>
                  {message.etat === "envoi" ? (
                    <>
                      <Loader2 size={11} className="animate-spin" /> envoi…
                    </>
                  ) : message.etat === "echec" ? (
                    <button type="button" onClick={() => reessayer(message)} className="flex items-center gap-1 font-semibold text-white underline">
                      <RotateCcw size={11} /> Non envoyé · réessayer
                    </button>
                  ) : (
                    formatDate(new Date(message.creeLe))
                  )}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bas} />
      </div>

      {enregistre != null ? (
        <div className="flex items-center gap-3 border-t border-ink/[0.06] px-4 py-3">
          <button type="button" className="bouton-fantome text-cap" onClick={() => arreterEnregistrement(true)} aria-label="Annuler la note vocale">
            <Trash2 size={18} />
          </button>
          <span className="flex flex-1 items-center gap-2.5 text-sm font-medium">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cap" />
            Enregistrement… {dureeTexte((maintenant - enregistre) / 1000)}
            <span className="text-xs font-normal text-ink/45">(5 min au plus)</span>
          </span>
          <button type="button" className="bouton" onClick={() => arreterEnregistrement(false)}>
            <Square size={13} className="fill-current" /> Envoyer
          </button>
        </div>
      ) : (
        <div className="relative border-t border-ink/[0.06]">
          {jeton && (personnes.length > 0 || suggestionsDossiers.length > 0) ? (
            <ul className="carte absolute right-4 bottom-full left-4 z-20 mb-2 max-h-56 overflow-y-auto p-1.5 shadow-lg" role="listbox">
              {personnes.map((personne, index) => (
                <li key={personne.id}>
                  <button type="button" className={`flex w-full rounded-lg px-2.5 py-1.5 text-left text-sm ${index === choix ? "bg-desk/[0.08]" : ""}`} onMouseDown={(event) => { event.preventDefault(); inserer(`@${personne.nom} `); }}>
                    @{personne.nom}
                  </button>
                </li>
              ))}
              {suggestionsDossiers.map((dossier, index) => (
                <li key={dossier.id}>
                  <button type="button" className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${index === choix ? "bg-desk/[0.08]" : ""}`} onMouseDown={(event) => { event.preventDefault(); inserer(`#${dossier.reference} `); }}>
                    <Hash size={14} className="text-desk" />
                    <span className="min-w-0 truncate"><span className="font-semibold">{dossier.reference}</span> · {dossier.client}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="flex items-end gap-2 px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void envoyer();
            }}
          >
            <input
              ref={selecteur}
              type="file"
              multiple
              hidden
              accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.zip,.mp3,.m4a,.ogg,.wav,.webm"
              onChange={(event) => {
                if (event.currentTarget.files) envoyerFichiers(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            <button type="button" className="bouton-fantome h-11 w-11 shrink-0 justify-center p-0" onClick={() => selecteur.current?.click()} title="Joindre un fichier (10 Mo au plus)" aria-label="Joindre un fichier">
              <Paperclip size={18} />
            </button>
            <textarea
              ref={champ}
              className="champ min-h-11 flex-1 resize-none"
              rows={2}
              maxLength={4000}
              value={texte}
              placeholder="@ un collègue, # un dossier, Entrée pour envoyer"
              aria-label="Message au groupe"
              onChange={(event) => {
                setTexte(event.target.value);
                detecter();
              }}
              onClick={detecter}
              onKeyUp={detecter}
              onPaste={(event) => {
                if (event.clipboardData.files.length === 0) return;
                event.preventDefault();
                envoyerFichiers(event.clipboardData.files);
              }}
              onKeyDown={(event) => {
                const liste = jeton?.signe === "@" ? personnes : suggestionsDossiers;
                if (jeton && liste.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                  event.preventDefault();
                  setChoix((actuel) => (actuel + (event.key === "ArrowDown" ? 1 : liste.length - 1)) % liste.length);
                  return;
                }
                if (jeton && liste.length > 0 && event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  const retenu = liste[Math.min(choix, liste.length - 1)];
                  inserer("reference" in retenu ? `#${retenu.reference} ` : `@${retenu.nom} `);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void envoyer();
                }
              }}
            />
            <button type="button" className="bouton-second h-11 w-11 shrink-0 justify-center p-0" onClick={() => void demarrerEnregistrement()} title="Enregistrer une note vocale" aria-label="Enregistrer une note vocale">
              <Mic size={18} />
            </button>
            <button className="bouton h-11 shrink-0" type="submit" disabled={envoi}>
              {envoi ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              <span className="hidden sm:inline">Envoyer</span>
            </button>
          </form>
          {erreur ? <p className="px-4 pb-3 text-sm text-cap">{erreur}</p> : null}
        </div>
      )}
      {survol ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[inherit] border-2 border-dashed border-desk bg-white/85 text-sm font-semibold text-desk">
          <span className="flex items-center gap-2">
            <Upload size={18} /> Déposez le fichier pour l&apos;envoyer
          </span>
        </div>
      ) : null}
    </article>
  );
}

function TexteGroupe({ texte, noms, membres, moi }: { texte: string; noms: string[]; membres: Membre[]; moi: boolean }) {
  return decouperGroupe(texte, noms).map((segment, index) => {
    if (segment.type === "personne") {
      const membre = membres.find((ligne) => ligne.nom.toLocaleLowerCase("fr") === segment.nom.toLocaleLowerCase("fr"));
      const classe = moi ? "font-semibold underline decoration-white/50" : "font-semibold text-desk";
      return membre ? (
        <Link key={index} href={`/messages?avec=${membre.id}`} className={classe}>@{segment.nom}</Link>
      ) : (
        <span key={index} className={classe}>@{segment.nom}</span>
      );
    }
    if (segment.type === "dossier") {
      return (
        <Link key={index} href={`/dossiers?q=${segment.reference}`} className={moi ? "font-semibold underline decoration-white/50" : "font-semibold text-desk"}>
          #{segment.reference}
        </Link>
      );
    }
    return <span key={index}>{segment.texte}</span>;
  });
}

type MemoireOuverte = { id: string; sorte: "avec" | "groupe"; ouvertLe: number };

function cleOuvertes(moiId: string) {
  return `edudesk-ouvertes-${moiId}`;
}

function lireOuvertes(moiId: string): MemoireOuverte[] {
  try {
    const brut = localStorage.getItem(cleOuvertes(moiId));
    const donnees: unknown = brut ? JSON.parse(brut) : [];
    if (!Array.isArray(donnees)) return [];
    return donnees.filter((entree): entree is MemoireOuverte => {
      if (!entree || typeof entree !== "object") return false;
      const ligne = entree as MemoireOuverte;
      return (ligne.sorte === "avec" || ligne.sorte === "groupe") && typeof ligne.id === "string" && typeof ligne.ouvertLe === "number";
    });
  } catch {
    return [];
  }
}

function ecrireOuvertes(moiId: string, entrees: MemoireOuverte[]) {
  try {
    localStorage.setItem(cleOuvertes(moiId), JSON.stringify(entrees.slice(0, 40)));
  } catch {
    /* le navigateur peut refuser le stockage */
  }
}

function toucherOuverte(liste: MemoireOuverte[], id: string, sorte: MemoireOuverte["sorte"]): MemoireOuverte[] {
  return [{ id, sorte, ouvertLe: Date.now() }, ...liste.filter((entree) => entree.id !== id || entree.sorte !== sorte)];
}

function LigneOuverte({
  href,
  actif,
  nom,
  detail,
  nonLus,
  visuel,
}: {
  href: string;
  actif: boolean;
  nom: string;
  detail: string | null;
  nonLus: number;
  visuel: ReactNode;
}) {
  const nombre = actif ? 0 : nonLus;
  return (
    <Link href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${actif ? "bg-desk/[0.08]" : "hover:bg-paper"}`}>
      {visuel}
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${nombre ? "font-bold" : "font-semibold"}`}>{nom}</span>
          {nombre > 0 ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-desk px-1.5 text-[11px] font-bold text-white">{nombre}</span> : null}
        </span>
        {detail ? <span className="block truncate text-xs text-ink/45">{detail}</span> : null}
      </span>
    </Link>
  );
}

export function ColonneDiscussions({
  groupes,
  contacts,
  moiId,
  groupeActif,
  collegueActif,
}: {
  groupes: GroupeListe[];
  contacts: Contact[];
  moiId: string;
  groupeActif: string | null;
  collegueActif: string | null;
}) {
  const [groupesLive, setGroupesLive] = useState(groupes);
  const [contactsLive, setContactsLive] = useState(contacts);
  const [memoires, setMemoires] = useState<MemoireOuverte[]>([]);
  const groupesRef = useRef(groupes);
  groupesRef.current = groupes;

  useEffect(() => setGroupesLive(groupes), [groupes]);
  useEffect(() => setContactsLive(contacts), [contacts]);

  useEffect(() => {
    let suivantes = lireOuvertes(moiId);
    if (collegueActif) suivantes = toucherOuverte(suivantes, collegueActif, "avec");
    const groupe = groupesRef.current.find((ligne) => ligne.id === groupeActif);
    if (groupe && !groupe.general) suivantes = toucherOuverte(suivantes, groupe.id, "groupe");
    ecrireOuvertes(moiId, suivantes);
    setMemoires(suivantes);
  }, [moiId, collegueActif, groupeActif]);

  useEffect(() => {
    const recevoir = (event: Event) => {
      const detail = (event as CustomEvent<EvenementClient>).detail;
      if (detail.type === "groupe") {
        const apercu = apercuMessage(detail.message).replace(/\s+/g, " ").trim().slice(0, 80);
        const prefixe = detail.message.deId === moiId ? "Vous" : detail.message.deNom.split(" ")[0] || detail.message.deNom;
        setGroupesLive((actuels) =>
          actuels.map((groupe) =>
            groupe.id === detail.groupeId
              ? {
                  ...groupe,
                  apercu: apercu ? `${prefixe} : ${apercu}` : groupe.apercu,
                  nonLus: detail.message.deId === moiId || groupe.id === groupeActif ? groupe.nonLus : groupe.nonLus + 1,
                }
              : groupe,
          ),
        );
        return;
      }
      if (detail.type !== "message") return;
      const message = detail.message;
      const autre = message.deId === moiId ? message.aId : message.deId;
      setContactsLive((actuels) => {
        const contact = actuels.find((ligne) => ligne.id === autre);
        if (!contact || contact.apercu?.creeLe === message.creeLe) return actuels;
        const recu = message.deId !== moiId && !message.lu && !enLecture(autre) && autre !== collegueActif;
        return actuels.map((ligne) =>
          ligne.id === autre
            ? {
                ...ligne,
                nonLus: autre === collegueActif ? 0 : ligne.nonLus + (recu ? 1 : 0),
                apercu: { texte: apercuMessage(message), moi: message.deId === moiId, creeLe: message.creeLe },
              }
            : ligne,
        );
      });
    };
    window.addEventListener(EVENEMENT_FLUX, recevoir);
    return () => window.removeEventListener(EVENEMENT_FLUX, recevoir);
  }, [moiId, groupeActif, collegueActif]);

  const souvenir = (id: string, sorte: MemoireOuverte["sorte"]) => memoires.find((entree) => entree.id === id && entree.sorte === sorte);
  const ouverteGroupe = (groupe: GroupeListe) => groupe.general || groupe.id === groupeActif || !!groupe.apercu || !!souvenir(groupe.id, "groupe");
  const ouverteCollegue = (contact: Contact) => contact.id === collegueActif || !!contact.apercu || !!souvenir(contact.id, "avec");
  const rang = (id: string, sorte: MemoireOuverte["sorte"], creeLe?: string | null) => souvenir(id, sorte)?.ouvertLe ?? (creeLe ? Date.parse(creeLe) : 0);

  const ouvertes = [
    ...groupesLive.filter(ouverteGroupe).map((groupe) => ({
      cle: `groupe-${groupe.id}`,
      rang: groupe.general ? Number.POSITIVE_INFINITY : rang(groupe.id, "groupe"),
      ligne: (
        <LigneOuverte
          href={`/messages?groupe=${groupe.id}`}
          actif={groupe.id === groupeActif}
          nom={groupe.nom}
          detail={groupe.apercu ?? (groupe.general ? "Tous les collaborateurs" : groupe.client)}
          nonLus={groupe.nonLus}
          visuel={
            groupe.general ? (
              <img src="/icon.png" alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-desk/10 text-desk">
                <Users size={16} />
              </span>
            )
          }
        />
      ),
    })),
    ...contactsLive.filter(ouverteCollegue).map((contact) => ({
      cle: `avec-${contact.id}`,
      rang: rang(contact.id, "avec", contact.apercu?.creeLe),
      ligne: (
        <LigneOuverte
          href={`/messages?avec=${contact.id}`}
          actif={contact.id === collegueActif}
          nom={`${contact.prenom} ${contact.nom}`}
          detail={contact.apercu ? `${contact.apercu.moi ? "Vous : " : ""}${contact.apercu.texte}` : contact.role}
          nonLus={contact.nonLus}
          visuel={<AvatarPresence userId={contact.id} prenom={contact.prenom} nom={contact.nom} />}
        />
      ),
    })),
  ].sort((a, b) => b.rang - a.rang);

  return (
    <div>
      {ouvertes.length > 0 ? (
        <div className="carte mb-3 p-2">
          <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-ink/45 uppercase">Ouvertes</p>
          <nav aria-label="Conversations ouvertes" className="grid">
            {ouvertes.map((entree) => (
              <div key={entree.cle}>{entree.ligne}</div>
            ))}
          </nav>
        </div>
      ) : null}
      <ListeGroupes groupes={groupesLive.filter((groupe) => !ouverteGroupe(groupe))} actifId={groupeActif} moiId={moiId} />
      <ListeContacts moiId={moiId} actifId={collegueActif} initiaux={contactsLive.filter((contact) => !ouverteCollegue(contact))} />
    </div>
  );
}
