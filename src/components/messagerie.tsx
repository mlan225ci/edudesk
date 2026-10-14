"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Loader2, RotateCcw, Send, Volume2, VolumeX } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Avatar } from "@/components/ui";
import { useToast } from "@/components/toasts";
import {
  EVENEMENT_FLUX,
  definirConversationOuverte,
  enLecture,
  jouerSon,
  reglerSon,
  sonActive,
  type EvenementClient,
} from "@/components/centre-messages";
import { marquerLu, posterMessage } from "@/server/messages-actions";
import type { MessageFlux } from "@/server/temps-reel";

type Ligne = MessageFlux & { etat?: "envoi" | "echec" };

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

export function Conversation({
  moiId,
  correspondant,
  initiaux,
}: {
  moiId: string;
  correspondant: { id: string; prenom: string; nom: string; role: string };
  initiaux: MessageFlux[];
}) {
  const [messages, setMessages] = useState<Ligne[]>(initiaux);
  const router = useRouter();
  const toast = useToast();
  const fil = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const aLire = useRef(false);
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
        if (message.deId === id && !message.lu) {
          if (enLecture(id)) lire();
          else aLire.current = true;
        }
      } else if (evenement.type === "lu" && evenement.par === id) {
        setMessages((actuels) => actuels.map((ligne) => (ligne.deId === moiId && !ligne.lu ? { ...ligne, lu: true } : ligne)));
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
    };
  }, [id, moiId, lire, router]);

  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const expedier = async (texte: string, cle = nouvelleCle()) => {
    const brouillon: Ligne = { id: `brouillon-${cle}`, cle, deId: moiId, aId: id, texte, creeLe: new Date().toISOString(), lu: false, deNom: "", etat: "envoi" };
    setMessages((actuels) => trier([...actuels.filter((ligne) => ligne.cle !== cle), brouillon]));
    const resultat = await posterMessage(id, texte, cle).catch(() => ({ error: "Connexion perdue : message non envoyé." }));
    if ("error" in resultat) {
      setMessages((actuels) => actuels.map((ligne) => (ligne.cle === cle && ligne.etat ? { ...ligne, etat: "echec" } : ligne)));
      toast(resultat.error, "erreur");
      return;
    }
    setMessages((actuels) => integrer(actuels, resultat.message));
  };

  const envoyer = () => {
    const texte = champ.current?.value.replace(/\r/g, "").trim() ?? "";
    if (!texte) return;
    if (champ.current) champ.current.value = "";
    void expedier(texte);
    champ.current?.focus();
  };

  return (
    <article className="carte flex flex-col p-0">
      <header className="flex items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5">
        <Avatar prenom={correspondant.prenom} nom={correspondant.nom} />
        <div>
          <p className="font-semibold">
            {correspondant.prenom} {correspondant.nom}
          </p>
          <p className="text-xs text-ink/50">{correspondant.role}</p>
        </div>
      </header>
      <div ref={fil} className="flex h-[58vh] min-h-72 flex-col gap-2 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
        {messages.length === 0 ? (
          <p className="m-auto text-sm text-ink/45">Aucun message. Écrivez le premier.</p>
        ) : (
          messages.map((message) => {
            const moi = message.deId === moiId;
            return (
              <div key={message.cle && message.etat ? message.cle : message.id} className={`flex ${moi ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${moi ? "rounded-br-md bg-desk text-white" : "rounded-bl-md bg-paper"} ${message.etat === "envoi" ? "opacity-70" : ""} ${message.etat === "echec" ? "bg-cap/90" : ""}`}
                >
                  <p className="whitespace-pre-line break-words">{message.texte}</p>
                  <p className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${moi ? "text-white/65" : "text-ink/40"}`} suppressHydrationWarning>
                    {message.etat === "envoi" ? (
                      <>
                        <Loader2 size={11} className="animate-spin" /> envoi…
                      </>
                    ) : message.etat === "echec" ? (
                      <button type="button" onClick={() => void expedier(message.texte, message.cle)} className="flex items-center gap-1 font-semibold text-white underline">
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
      </div>
      <form
        className="flex flex-wrap items-end gap-2 border-t border-ink/[0.06] px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          envoyer();
        }}
      >
        <textarea
          ref={champ}
          className="champ min-h-11 flex-1 resize-none"
          rows={2}
          maxLength={4000}
          placeholder="Écrire un message… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
          aria-label="Message"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              envoyer();
            }
          }}
        />
        <button className="bouton" type="submit">
          <Send size={15} /> Envoyer
        </button>
      </form>
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

  useEffect(() => setContacts(initiaux), [initiaux]);

  useEffect(() => {
    const arreter = ecouterFlux((evenement) => {
      if (evenement.type !== "message") return;
      const message = evenement.message;
      const autre = message.deId === moiId ? message.aId : message.deId;
      setContacts((actuels) => {
        const contact = actuels.find((ligne) => ligne.id === autre);
        if (!contact || contact.apercu?.creeLe === message.creeLe) return actuels;
        const recu = message.deId !== moiId && !message.lu && !enLecture(autre);
        return trierContacts(
          actuels.map((ligne) =>
            ligne.id === autre
              ? { ...ligne, nonLus: ligne.nonLus + (recu ? 1 : 0), apercu: { texte: message.texte, moi: message.deId === moiId, creeLe: message.creeLe } }
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
    return () => {
      arreter();
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [moiId, actifId]);

  return (
    <nav className="carte max-h-[70vh] overflow-y-auto p-2 [scrollbar-width:thin]" aria-label="Conversations">
      {contacts.map((contact) => {
        const actif = contact.id === actifId;
        const nombre = actif ? 0 : contact.nonLus;
        return (
          <Link
            key={contact.id}
            href={`/messages?avec=${contact.id}`}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${actif ? "bg-desk/[0.08]" : "hover:bg-paper"}`}
          >
            <Avatar prenom={contact.prenom} nom={contact.nom} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className={`truncate text-sm ${nombre ? "font-bold" : "font-semibold"}`}>
                  {contact.prenom} {contact.nom}
                </span>
                {nombre ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-desk px-1.5 text-[11px] font-bold text-white">{nombre}</span> : null}
              </span>
              <span className={`block truncate text-xs ${nombre ? "text-ink/80" : "text-ink/45"}`}>
                {contact.apercu ? `${contact.apercu.moi ? "Vous : " : ""}${contact.apercu.texte}` : contact.role}
              </span>
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
