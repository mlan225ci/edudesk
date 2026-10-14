"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Download, FileText, Loader2, Mic, Paperclip, Pause, Play, RotateCcw, Send, Square, Trash2, Upload, Volume2, VolumeX } from "lucide-react";
import { formatDate } from "@/lib/format";
import { apercuMessage, dureeTexte, tailleTexte, urlFichierMessage } from "@/lib/messages";
import { Avatar } from "@/components/ui";
import { useToast } from "@/components/toasts";
import {
  EVENEMENT_FLUX,
  definirConversationOuverte,
  enLecture,
  jouerSon,
  reglerSon,
  sonActive,
  usePresence,
  type EvenementClient,
} from "@/components/centre-messages";
import { marquerLu, posterMessage } from "@/server/messages-actions";
import type { MessageFlux } from "@/server/temps-reel";

type Ligne = MessageFlux & { etat?: "envoi" | "echec" };
type EnvoiFichier = { fichier: File; texte: string; duree: number | null };

const TAILLE_MAX = 10 * 1024 * 1024;
const DUREE_MAX_VOCAL = 300;
const FORMATS_AUDIO: [string, string][] = [
  ["audio/webm;codecs=opus", ".webm"],
  ["audio/webm", ".webm"],
  ["audio/ogg;codecs=opus", ".ogg"],
  ["audio/mp4", ".m4a"],
];

function trier(lignes: Ligne[]) {
  return lignes.sort((a, b) => (a.etat ? 1 : 0) - (b.etat ? 1 : 0) || a.creeLe.localeCompare(b.creeLe));
}

function integrer(lignes: Ligne[], message: MessageFlux) {
  const sansDoublon = lignes.filter((ligne) => ligne.id !== message.id && !(message.cle && ligne.etat && ligne.cle === message.cle));
  return trier([...sansDoublon, message]);
}

function ecouterFlux(rappel: (evenement: EvenementClient) => void) {
  const surFlux = (event: Event) => rappel((event as CustomEvent<EvenementClient>).detail);
  window.addEventListener(EVENEMENT_FLUX, surFlux);
  return () => window.removeEventListener(EVENEMENT_FLUX, surFlux);
}

function nouvelleCle() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function vuTexte(iso: string | null) {
  if (!iso) return "Hors ligne";
  const date = new Date(iso);
  const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" }).format(date);
  const jour = (valeur: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Africa/Abidjan" }).format(valeur);
  return jour(date) === jour(new Date()) ? `Vu à ${heure}` : `Vu le ${jour(date)} à ${heure}`;
}

export function AvatarPresence({ userId, prenom, nom }: { userId: string; prenom: string; nom: string }) {
  const { enLigne } = usePresence(userId);
  return (
    <span className="relative shrink-0">
      <Avatar prenom={prenom} nom={nom} />
      {enLigne ? <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-vert ring-2 ring-white" title="En ligne" /> : null}
    </span>
  );
}

function PointsEcriture() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 150, 300].map((delai) => (
        <span key={delai} className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: `${delai}ms` }} />
      ))}
    </span>
  );
}

function LecteurVocal({ src, duree, moi }: { src: string | null; duree: number | null; moi: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [lecture, setLecture] = useState(false);
  const [position, setPosition] = useState(0);
  const total = duree ?? 0;
  const pourcentage = total > 0 ? Math.min(100, (position / total) * 100) : 0;
  return (
    <div className="flex w-60 max-w-full items-center gap-2.5 py-0.5">
      <button
        type="button"
        disabled={!src}
        aria-label={lecture ? "Pause" : "Écouter la note vocale"}
        onClick={() => {
          const element = audio.current;
          if (!element) return;
          if (element.paused) {
            document.querySelectorAll("audio").forEach((autre) => autre !== element && autre.pause());
            element.play().catch(() => undefined);
          } else element.pause();
        }}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition disabled:opacity-50 ${moi ? "bg-white text-desk hover:bg-white/90" : "bg-desk text-white hover:bg-desk/90"}`}
      >
        {lecture ? <Pause size={16} /> : <Play size={16} className="translate-x-px" />}
      </button>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`h-1.5 overflow-hidden rounded-full ${moi ? "bg-white/30" : "bg-ink/15"}`}>
          <span className={`block h-full rounded-full transition-[width] ${moi ? "bg-white" : "bg-desk"}`} style={{ width: `${pourcentage}%` }} />
        </span>
        <span className={`text-[11px] ${moi ? "text-white/75" : "text-ink/50"}`}>
          <Mic size={10} className="mr-0.5 inline" /> {dureeTexte(lecture || position > 0 ? position : total)}
        </span>
      </span>
      {src ? (
        <audio
          ref={audio}
          src={src}
          preload="none"
          onPlay={() => setLecture(true)}
          onPause={() => setLecture(false)}
          onEnded={() => {
            setLecture(false);
            setPosition(0);
          }}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        />
      ) : null}
    </div>
  );
}

function ContenuFichier({ message, moi }: { message: Ligne; moi: boolean }) {
  const fichier = message.fichier;
  if (!fichier) return null;
  const url = message.etat ? null : urlFichierMessage(message.id);
  if (fichier.duree != null || fichier.type.startsWith("audio/")) return <LecteurVocal src={url} duree={fichier.duree} moi={moi} />;
  if (fichier.type.startsWith("image/") && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt={fichier.nom} loading="lazy" className="max-h-64 max-w-full rounded-xl object-cover" />
      </a>
    );
  }
  const contenu = (
    <>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${moi ? "bg-white/15" : "bg-desk/10 text-desk"}`}>
        <FileText size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{fichier.nom}</span>
        <span className={`text-[11px] ${moi ? "text-white/70" : "text-ink/50"}`}>{tailleTexte(fichier.taille)}</span>
      </span>
      {url ? <Download size={16} className="shrink-0 opacity-70" /> : null}
    </>
  );
  return url ? (
    <a href={`${url}?telecharger=1`} className="flex w-64 max-w-full items-center gap-2.5 py-0.5 hover:opacity-90">
      {contenu}
    </a>
  ) : (
    <span className="flex w-64 max-w-full items-center gap-2.5 py-0.5">{contenu}</span>
  );
}

export function Conversation({
  moiId,
  correspondant,
  initiaux,
}: {
  moiId: string;
  correspondant: { id: string; prenom: string; nom: string; role: string; vuLe: string | null };
  initiaux: MessageFlux[];
}) {
  const [messages, setMessages] = useState<Ligne[]>(initiaux);
  const [ecrit, setEcrit] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [enregistre, setEnregistre] = useState<number | null>(null);
  const [maintenant, setMaintenant] = useState(0);
  const router = useRouter();
  const toast = useToast();
  const presence = usePresence(correspondant.id);
  const fil = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const selecteur = useRef<HTMLInputElement>(null);
  const aLire = useRef(false);
  const dernierSignal = useRef(0);
  const minuteurEcrit = useRef<number | undefined>(undefined);
  const envoisFichiers = useRef(new Map<string, EnvoiFichier>());
  const enregistrement = useRef<{ enregistreur: MediaRecorder; flux: MediaStream; debut: number; annule: boolean } | null>(null);
  const id = correspondant.id;

  useEffect(() => {
    setMessages((actuels) => {
      const enAttente = actuels.filter((ligne) => ligne.etat);
      return trier([...initiaux.filter((message) => !enAttente.some((ligne) => ligne.cle && ligne.cle === message.cle)), ...enAttente]);
    });
  }, [initiaux]);

  useEffect(() => {
    definirConversationOuverte(id);
    return () => definirConversationOuverte(null);
  }, [id]);

  const lire = useCallback(() => {
    aLire.current = false;
    marquerLu(id).catch(() => {});
  }, [id]);

  useEffect(() => {
    const arreter = ecouterFlux((evenement) => {
      if (evenement.type === "message") {
        const message = evenement.message;
        const concerne = (message.deId === id && message.aId === moiId) || (message.deId === moiId && message.aId === id);
        if (!concerne) return;
        setMessages((actuels) => integrer(actuels, message));
        if (message.deId === id) {
          setEcrit(false);
          if (!message.lu) {
            if (enLecture(id)) lire();
            else aLire.current = true;
          }
        }
      } else if (evenement.type === "lu" && evenement.par === id) {
        setMessages((actuels) => actuels.map((ligne) => (ligne.deId === moiId && !ligne.lu ? { ...ligne, lu: true } : ligne)));
      } else if (evenement.type === "ecrit" && evenement.par === id) {
        setEcrit(true);
        window.clearTimeout(minuteurEcrit.current);
        minuteurEcrit.current = window.setTimeout(() => setEcrit(false), 4500);
      } else if (evenement.type === "resync") {
        router.refresh();
      }
    });
    const surVisibilite = () => {
      if (document.visibilityState === "visible" && aLire.current) lire();
    };
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      arreter();
      document.removeEventListener("visibilitychange", surVisibilite);
      window.clearTimeout(minuteurEcrit.current);
    };
  }, [id, moiId, lire, router]);

  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, ecrit]);

  const signalerEcriture = useCallback(() => {
    const instant = Date.now();
    if (instant - dernierSignal.current < 2500) return;
    dernierSignal.current = instant;
    fetch("/api/messages/signal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aId: id }) }).catch(() => undefined);
  }, [id]);

  const marquerEchec = (cle: string, erreur: string) => {
    setMessages((actuels) => actuels.map((ligne) => (ligne.cle === cle && ligne.etat ? { ...ligne, etat: "echec" } : ligne)));
    toast(erreur, "erreur");
  };

  const expedier = async (texte: string, cle = nouvelleCle()) => {
    const brouillon: Ligne = { id: `brouillon-${cle}`, cle, deId: moiId, aId: id, texte, creeLe: new Date().toISOString(), lu: false, deNom: "", fichier: null, etat: "envoi" };
    setMessages((actuels) => trier([...actuels.filter((ligne) => ligne.cle !== cle), brouillon]));
    dernierSignal.current = 0;
    const resultat = await posterMessage(id, texte, cle).catch(() => ({ error: "Connexion perdue : message non envoyé." }));
    if ("error" in resultat) return marquerEchec(cle, resultat.error);
    setMessages((actuels) => integrer(actuels, resultat.message));
  };

  const expedierFichier = async (envoi: EnvoiFichier, cle = nouvelleCle()) => {
    if (envoi.fichier.size > TAILLE_MAX) {
      toast(`« ${envoi.fichier.name} » dépasse 10 Mo.`, "erreur");
      return;
    }
    envoisFichiers.current.set(cle, envoi);
    const brouillon: Ligne = {
      id: `brouillon-${cle}`,
      cle,
      deId: moiId,
      aId: id,
      texte: envoi.texte,
      creeLe: new Date().toISOString(),
      lu: false,
      deNom: "",
      fichier: { nom: envoi.fichier.name, type: envoi.fichier.type, taille: envoi.fichier.size, duree: envoi.duree },
      etat: "envoi",
    };
    setMessages((actuels) => trier([...actuels.filter((ligne) => ligne.cle !== cle), brouillon]));
    const formulaire = new FormData();
    formulaire.set("fichier", envoi.fichier);
    formulaire.set("aId", id);
    formulaire.set("texte", envoi.texte);
    formulaire.set("cle", cle);
    if (envoi.duree != null) formulaire.set("duree", String(envoi.duree));
    const reponse = await fetch("/api/messages/fichier", { method: "POST", body: formulaire }).catch(() => null);
    const donnees = reponse ? ((await reponse.json().catch(() => null)) as { message?: MessageFlux; error?: string } | null) : null;
    if (!reponse?.ok || !donnees?.message) return marquerEchec(cle, donnees?.error ?? "Envoi du fichier impossible. Vérifiez la connexion.");
    envoisFichiers.current.delete(cle);
    setMessages((actuels) => integrer(actuels, donnees.message as MessageFlux));
  };

  const envoyerFichiers = (fichiers: FileList | File[]) => {
    const liste = [...fichiers];
    if (liste.length === 0) return;
    const legende = champ.current?.value.replace(/\r/g, "").trim() ?? "";
    if (champ.current) champ.current.value = "";
    liste.slice(0, 10).forEach((fichier, index) => void expedierFichier({ fichier, texte: index === 0 ? legende : "", duree: null }));
  };

  const envoyer = () => {
    const texte = champ.current?.value.replace(/\r/g, "").trim() ?? "";
    if (!texte) return;
    if (champ.current) champ.current.value = "";
    void expedier(texte);
    champ.current?.focus();
  };

  const reessayer = (ligne: Ligne) => {
    if (!ligne.cle) return;
    const envoi = envoisFichiers.current.get(ligne.cle);
    if (envoi) void expedierFichier(envoi, ligne.cle);
    else void expedier(ligne.texte, ligne.cle);
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
      toast("Enregistrement audio indisponible ici : il faut un navigateur récent et une adresse sécurisée (https ou localhost).", "erreur");
      return;
    }
    let flux: MediaStream;
    try {
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("Micro refusé ou introuvable. Autorisez le micro pour ce site dans le navigateur.", "erreur");
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
        toast("Note vocale trop courte : maintenez l'enregistrement au moins une seconde.", "erreur");
        return;
      }
      const type = enregistreur.mimeType || format?.[0] || "audio/webm";
      const extension = format?.[1] ?? (type.includes("mp4") ? ".m4a" : type.includes("ogg") ? ".ogg" : ".webm");
      const blob = new Blob(morceaux, { type: type.split(";")[0] });
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
      else if (instant - dernierSignal.current >= 2500) signalerEcriture();
    }, 250);
    return () => window.clearInterval(minuteur);
  }, [enregistre, arreterEnregistrement, signalerEcriture]);

  useEffect(() => () => arreterEnregistrement(true), [arreterEnregistrement]);

  return (
    <article
      className="carte relative flex flex-col p-0"
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
      <header className="flex items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5">
        <AvatarPresence userId={correspondant.id} prenom={correspondant.prenom} nom={correspondant.nom} />
        <div className="min-w-0">
          <p className="font-semibold">
            {correspondant.prenom} {correspondant.nom}
          </p>
          <p className="text-xs text-ink/50" suppressHydrationWarning>
            {ecrit ? (
              <span className="font-medium text-desk">en train d&apos;écrire…</span>
            ) : presence.enLigne ? (
              <span className="font-medium text-vert">En ligne</span>
            ) : (
              <>
                {correspondant.role} · {vuTexte(presence.vuLe ?? correspondant.vuLe)}
              </>
            )}
          </p>
        </div>
      </header>
      <div ref={fil} className="flex h-[58vh] min-h-72 flex-col gap-2 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
        {messages.length === 0 ? (
          <p className="m-auto text-sm text-ink/45">Aucun message. Écrivez le premier, joignez un fichier ou enregistrez une note vocale.</p>
        ) : (
          messages.map((message) => {
            const moi = message.deId === moiId;
            return (
              <div key={message.cle && message.etat ? message.cle : message.id} className={`flex ${moi ? "justify-end" : "justify-start"}`}>
                <div
                  className={`grid max-w-[78%] gap-1.5 rounded-2xl px-3.5 py-2 text-sm ${moi ? "rounded-br-md bg-desk text-white" : "rounded-bl-md bg-paper"} ${message.etat === "envoi" ? "opacity-70" : ""} ${message.etat === "echec" ? "bg-cap/90" : ""}`}
                >
                  <ContenuFichier message={message} moi={moi} />
                  {message.texte ? <p className="whitespace-pre-line break-words">{message.texte}</p> : null}
                  <p className={`flex items-center justify-end gap-1 text-[11px] ${moi ? "text-white/65" : "text-ink/40"}`} suppressHydrationWarning>
                    {message.etat === "envoi" ? (
                      <>
                        <Loader2 size={11} className="animate-spin" /> envoi…
                      </>
                    ) : message.etat === "echec" ? (
                      <button type="button" onClick={() => reessayer(message)} className="flex items-center gap-1 font-semibold text-white underline">
                        <RotateCcw size={11} /> Non envoyé · réessayer
                      </button>
                    ) : (
                      <>
                        {formatDate(new Date(message.creeLe))}
                        {moi ? (message.lu ? " · lu" : " · envoyé") : ""}
                      </>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
        {ecrit ? (
          <div className="flex justify-start">
            <span className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-paper px-3.5 py-2.5 text-ink/45" aria-label={`${correspondant.prenom} écrit`}>
              <PointsEcriture />
            </span>
          </div>
        ) : null}
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
        <form
          className="flex items-end gap-2 border-t border-ink/[0.06] px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            envoyer();
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
            placeholder="Écrire un message… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
            aria-label="Message"
            autoFocus
            onInput={signalerEcriture}
            onPaste={(event) => {
              if (event.clipboardData.files.length === 0) return;
              event.preventDefault();
              envoyerFichiers(event.clipboardData.files);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                envoyer();
              }
            }}
          />
          <button type="button" className="bouton-second h-11 w-11 shrink-0 justify-center p-0" onClick={() => void demarrerEnregistrement()} title="Enregistrer une note vocale" aria-label="Enregistrer une note vocale">
            <Mic size={18} />
          </button>
          <button className="bouton h-11 shrink-0" type="submit">
            <Send size={15} /> <span className="hidden sm:inline">Envoyer</span>
          </button>
        </form>
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

export type Contact = {
  id: string;
  prenom: string;
  nom: string;
  role: string;
  nonLus: number;
  apercu: { texte: string; moi: boolean; creeLe: string } | null;
};

function trierContacts(contacts: Contact[]) {
  return [...contacts].sort(
    (a, b) => (b.apercu?.creeLe ?? "").localeCompare(a.apercu?.creeLe ?? "") || a.prenom.localeCompare(b.prenom),
  );
}

export function ListeContacts({ moiId, actifId, initiaux }: { moiId: string; actifId: string | null; initiaux: Contact[] }) {
  const [contacts, setContacts] = useState(initiaux);
  const [ecrivent, setEcrivent] = useState<Set<string>>(() => new Set());
  const minuteurs = useRef(new Map<string, number>());

  useEffect(() => setContacts(initiaux), [initiaux]);

  useEffect(() => {
    const arreterEcriture = (userId: string) => {
      window.clearTimeout(minuteurs.current.get(userId));
      minuteurs.current.delete(userId);
      setEcrivent((actuels) => {
        if (!actuels.has(userId)) return actuels;
        const suivants = new Set(actuels);
        suivants.delete(userId);
        return suivants;
      });
    };
    const arreter = ecouterFlux((evenement) => {
      if (evenement.type === "ecrit") {
        setEcrivent((actuels) => (actuels.has(evenement.par) ? actuels : new Set(actuels).add(evenement.par)));
        window.clearTimeout(minuteurs.current.get(evenement.par));
        minuteurs.current.set(
          evenement.par,
          window.setTimeout(() => arreterEcriture(evenement.par), 4500),
        );
        return;
      }
      if (evenement.type !== "message") return;
      const message = evenement.message;
      const autre = message.deId === moiId ? message.aId : message.deId;
      if (message.deId !== moiId) arreterEcriture(autre);
      setContacts((actuels) => {
        const contact = actuels.find((ligne) => ligne.id === autre);
        if (!contact || contact.apercu?.creeLe === message.creeLe) return actuels;
        const recu = message.deId !== moiId && !message.lu && !enLecture(autre);
        return trierContacts(
          actuels.map((ligne) =>
            ligne.id === autre
              ? { ...ligne, nonLus: ligne.nonLus + (recu ? 1 : 0), apercu: { texte: apercuMessage(message), moi: message.deId === moiId, creeLe: message.creeLe } }
              : ligne,
          ),
        );
      });
    });
    const surVisibilite = () => {
      if (document.visibilityState === "visible" && actifId) {
        setContacts((actuels) => actuels.map((ligne) => (ligne.id === actifId ? { ...ligne, nonLus: 0 } : ligne)));
      }
    };
    document.addEventListener("visibilitychange", surVisibilite);
    const enCours = minuteurs.current;
    return () => {
      arreter();
      document.removeEventListener("visibilitychange", surVisibilite);
      enCours.forEach((minuteur) => window.clearTimeout(minuteur));
    };
  }, [moiId, actifId]);

  return (
    <nav className="carte max-h-[70vh] overflow-y-auto p-2 [scrollbar-width:thin]" aria-label="Conversations">
      {contacts.map((contact) => {
        const actif = contact.id === actifId;
        const nombre = actif ? 0 : contact.nonLus;
        const ecriture = ecrivent.has(contact.id);
        return (
          <Link
            key={contact.id}
            href={`/messages?avec=${contact.id}`}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${actif ? "bg-desk/[0.08]" : "hover:bg-paper"}`}
          >
            <AvatarPresence userId={contact.id} prenom={contact.prenom} nom={contact.nom} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className={`truncate text-sm ${nombre ? "font-bold" : "font-semibold"}`}>
                  {contact.prenom} {contact.nom}
                </span>
                {nombre ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-desk px-1.5 text-[11px] font-bold text-white">{nombre}</span> : null}
              </span>
              {ecriture ? (
                <span className="block truncate text-xs font-medium text-desk">en train d&apos;écrire…</span>
              ) : (
                <span className={`block truncate text-xs ${nombre ? "text-ink/80" : "text-ink/45"}`}>
                  {contact.apercu ? `${contact.apercu.moi ? "Vous : " : ""}${contact.apercu.texte}` : contact.role}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function ReglagesAlertes() {
  const [son, setSon] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | "indisponible">("indisponible");

  useEffect(() => {
    setSon(sonActive());
    setPermission("Notification" in window ? Notification.permission : "indisponible");
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="bouton-second"
        title={son ? "Couper le son des nouveaux messages" : "Activer le son des nouveaux messages"}
        onClick={() => {
          reglerSon(!son);
          setSon(!son);
          if (!son) jouerSon(true);
        }}
      >
        {son ? <Volume2 size={16} /> : <VolumeX size={16} />}
        {son ? "Son activé" : "Son coupé"}
      </button>
      {permission === "default" ? (
        <button
          type="button"
          className="bouton-second"
          onClick={async () => {
            const resultat = await Notification.requestPermission();
            setPermission(resultat);
          }}
        >
          <BellRing size={16} /> Alertes sur le bureau
        </button>
      ) : null}
    </div>
  );
}
