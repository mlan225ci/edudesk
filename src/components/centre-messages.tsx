"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toasts";
import type { EvenementFlux, MessageFlux } from "@/server/temps-reel";

export type EvenementClient = EvenementFlux | { type: "resync" };

export const EVENEMENT_FLUX = "edudesk:flux";
const CLE_SON = "edudesk-son";

let conversationOuverte: string | null = null;

export function definirConversationOuverte(id: string | null) {
  conversationOuverte = id;
}

export function enLecture(correspondantId: string) {
  return document.visibilityState === "visible" && conversationOuverte === correspondantId;
}

let contexteAudio: AudioContext | null = null;

function audio() {
  if (typeof window === "undefined") return null;
  if (!contexteAudio) {
    const Constructeur = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructeur) return null;
    contexteAudio = new Constructeur();
  }
  return contexteAudio;
}

export function sonActive() {
  try {
    return localStorage.getItem(CLE_SON) !== "0";
  } catch {
    return true;
  }
}

export function reglerSon(actif: boolean) {
  try {
    localStorage.setItem(CLE_SON, actif ? "1" : "0");
  } catch {}
}

export function jouerSon(force = false) {
  if (!force && !sonActive()) return;
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const depart = ctx.currentTime + 0.03;
  for (const [frequence, decalage] of [
    [880, 0],
    [1318.5, 0.14],
  ]) {
    const oscillateur = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillateur.type = "sine";
    oscillateur.frequency.value = frequence;
    volume.gain.setValueAtTime(0.0001, depart + decalage);
    volume.gain.exponentialRampToValueAtTime(0.3, depart + decalage + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, depart + decalage + 0.5);
    oscillateur.connect(volume).connect(ctx.destination);
    oscillateur.start(depart + decalage);
    oscillateur.stop(depart + decalage + 0.55);
  }
}

const ContexteMessages = createContext<number | null>(null);

export function useMessagesNonLus() {
  return useContext(ContexteMessages);
}

export function CentreMessages({ moiId, initial, children }: { moiId: string; initial: number; children: React.ReactNode }) {
  const [nonLus, setNonLus] = useState(initial);
  const toast = useToast();
  const router = useRouter();
  const outils = useRef({ toast, router });
  outils.current = { toast, router };

  useEffect(() => setNonLus(initial), [initial]);

  useEffect(() => {
    const deverrouiller = () => {
      const ctx = audio();
      if (ctx?.state === "suspended") ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", deverrouiller);
    window.addEventListener("keydown", deverrouiller);
    return () => {
      window.removeEventListener("pointerdown", deverrouiller);
      window.removeEventListener("keydown", deverrouiller);
    };
  }, []);

  useEffect(() => {
    let actif = true;
    const vus = new Set<string>();
    const ouverture = Date.now() - 2000;
    const canal = "BroadcastChannel" in window ? new BroadcastChannel("edudesk-messages") : null;
    const abandon = new AbortController();
    let source: EventSource | null = null;
    let libererVerrou: (() => void) | null = null;

    let titreOrigine: string | null = null;
    let recusCache = 0;
    let minuteurTitre: number | undefined;
    const arreterTitre = () => {
      window.clearInterval(minuteurTitre);
      minuteurTitre = undefined;
      if (titreOrigine !== null) document.title = titreOrigine;
      titreOrigine = null;
      recusCache = 0;
    };
    const clignoterTitre = () => {
      recusCache += 1;
      if (titreOrigine === null) titreOrigine = document.title;
      window.clearInterval(minuteurTitre);
      let bascule = true;
      const annonce = `(${recusCache}) Nouveau message · EduDesk`;
      document.title = annonce;
      minuteurTitre = window.setInterval(() => {
        bascule = !bascule;
        document.title = bascule ? annonce : (titreOrigine ?? "EduDesk");
      }, 1200);
    };
    const surVisibilite = () => {
      if (document.visibilityState === "visible") arreterTitre();
    };
    document.addEventListener("visibilitychange", surVisibilite);

    const dejaSignale = (id: string) => {
      try {
        return localStorage.getItem(`edudesk-alerte-${id}`) !== null;
      } catch {
        return false;
      }
    };
    const signaler = (id: string) => {
      try {
        localStorage.setItem(`edudesk-alerte-${id}`, "1");
        window.setTimeout(() => localStorage.removeItem(`edudesk-alerte-${id}`), 60000);
      } catch {}
    };

    const notifierBureau = (message: MessageFlux) => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        const notification = new Notification(`Nouveau message de ${message.deNom}`, {
          body: message.texte.slice(0, 160),
          tag: `edudesk-message-${message.deId}`,
          icon: "/icon.png",
        });
        notification.onclick = () => {
          window.focus();
          outils.current.router.push(`/messages?avec=${message.deId}`);
          notification.close();
        };
      } catch {}
    };

    const alerter = (message: MessageFlux) => {
      if (document.visibilityState === "visible") {
        signaler(message.id);
        jouerSon();
        const extrait = message.texte.length > 90 ? `${message.texte.slice(0, 90)}…` : message.texte;
        outils.current.toast(`${message.deNom} : ${extrait}`, "message", `/messages?avec=${message.deId}`);
        return;
      }
      clignoterTitre();
      window.setTimeout(
        () => {
          if (!actif || dejaSignale(message.id)) return;
          signaler(message.id);
          jouerSon();
          notifierBureau(message);
        },
        300 + Math.random() * 250,
      );
    };

    const traiter = (evenement: EvenementClient) => {
      window.dispatchEvent(new CustomEvent<EvenementClient>(EVENEMENT_FLUX, { detail: evenement }));
      if (evenement.type === "compteur") setNonLus(evenement.nonLus);
      if (evenement.type !== "message") return;
      const message = evenement.message;
      if (vus.has(message.id)) return;
      vus.add(message.id);
      if (message.aId !== moiId || message.lu || Date.parse(message.creeLe) < ouverture) return;
      if (enLecture(message.deId)) return;
      setNonLus((valeur) => valeur + 1);
      alerter(message);
    };

    const ouvrirFlux = () => {
      let coupe = false;
      source = new EventSource("/api/messages/flux");
      for (const type of ["message", "lu", "compteur"] as const) {
        source.addEventListener(type, (event) => {
          const evenement = JSON.parse((event as MessageEvent<string>).data) as EvenementFlux;
          canal?.postMessage(evenement);
          traiter(evenement);
        });
      }
      source.onerror = () => {
        coupe = true;
      };
      source.onopen = () => {
        if (!coupe) return;
        coupe = false;
        canal?.postMessage({ type: "resync" });
        traiter({ type: "resync" });
      };
    };

    if (canal) canal.onmessage = (event: MessageEvent<EvenementClient>) => traiter(event.data);

    if (canal && navigator.locks) {
      navigator.locks
        .request("edudesk-flux-messages", { signal: abandon.signal }, () => {
          if (!actif) return;
          ouvrirFlux();
          return new Promise<void>((resoudre) => {
            libererVerrou = resoudre;
          });
        })
        .catch(() => {});
    } else {
      ouvrirFlux();
    }

    return () => {
      actif = false;
      abandon.abort();
      source?.close();
      libererVerrou?.();
      canal?.close();
      document.removeEventListener("visibilitychange", surVisibilite);
      arreterTitre();
    };
  }, [moiId]);

  return <ContexteMessages.Provider value={nonLus}>{children}</ContexteMessages.Provider>;
}
