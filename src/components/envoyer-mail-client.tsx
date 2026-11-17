"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Champ } from "@/components/ui";
import { nomComplet } from "@/lib/format";
import { envoyerCourrier, textesCourrier } from "@/server/communication-actions";

type ClientChoix = { id: string; prenom: string; nom: string; email: string | null };
type Modele = { code: string; libelle: string; sujet: string; corps: string };
type Contexte = { id: string; libelle: string; modeles: Modele[] };

function Bascule({
  label,
  valeur,
  onChange,
  options,
}: {
  label: string;
  valeur: string;
  onChange: (valeur: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset className="etiquette">
      <legend className="mb-1.5">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="cursor-pointer rounded-xl border border-ink/10 bg-white px-2 py-2.5 text-center text-xs font-semibold text-ink/70 transition hover:border-desk/30 has-checked:border-desk has-checked:bg-desk/[0.06] has-checked:text-desk"
          >
            <input type="radio" className="sr-only" checked={valeur === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function EnvoyerMailClient({ clients, modeles }: { clients: ClientChoix[]; modeles: Modele[] }) {
  const [destinataire, setDestinataire] = useState<"client" | "adresse">("client");
  const [clientId, setClientId] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<"modele" | "libre">("modele");
  const [code, setCode] = useState("");
  const [dossierId, setDossierId] = useState("");
  const [contextes, setContextes] = useState<Contexte[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [sansEmail, setSansEmail] = useState(false);

  const contexte = contextes?.find((item) => item.id === dossierId) ?? contextes?.[0];
  const catalogue = destinataire === "client" && contexte ? contexte.modeles : modeles;
  const choisi = catalogue.find((item) => item.code === code);

  function reinitialiser() {
    setDestinataire("client");
    setClientId("");
    setEmail("");
    setMessage("modele");
    setCode("");
    setDossierId("");
    setContextes(null);
    setSansEmail(false);
  }

  async function choisirClient(id: string) {
    setClientId(id);
    setContextes(null);
    setSansEmail(false);
    setDossierId("");
    if (!id) return;
    setChargement(true);
    try {
      const courrier = await textesCourrier(id);
      if (!courrier) {
        setSansEmail(true);
        return;
      }
      setContextes(courrier.contextes);
      setDossierId(courrier.contextes[0]?.id ?? "");
    } finally {
      setChargement(false);
    }
  }

  const client = clients.find((item) => item.id === clientId);
  const pret = message === "libre" || Boolean(choisi);

  return (
    <Tiroir
      label="Envoyer un e-mail"
      icone={<Mail size={15} />}
      titre="E-mail de notification"
      description="Un client ou une adresse. Un message préparé ou un texte libre."
      variante="second"
      largeur="lg"
    >
      <Formulaire
        action={envoyerCourrier}
        submit="Envoyer l'e-mail"
        succes="E-mail envoyé"
        icone={<Mail size={15} />}
        autoriser
        onSucces={reinitialiser}
        className="grid gap-4"
      >
        <Bascule
          label="Destinataire"
          valeur={destinataire}
          onChange={(valeur) => {
            setDestinataire(valeur as "client" | "adresse");
            setCode("");
          }}
          options={[
            { value: "client", label: "Un client" },
            { value: "adresse", label: "Une adresse e-mail" },
          ]}
        />

        {destinataire === "client" ? (
          <Champ label="Client">
            <select className="champ" value={clientId} onChange={(event) => void choisirClient(event.target.value)} required>
              <option value="">Choisir dans la liste</option>
              {clients.map((item) => (
                <option key={item.id} value={item.id}>
                  {nomComplet(item)}
                  {item.email ? ` — ${item.email}` : " — sans e-mail"}
                </option>
              ))}
            </select>
          </Champ>
        ) : (
          <Champ label="Adresse e-mail">
            <input className="champ" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nom@exemple.com" autoComplete="off" />
          </Champ>
        )}

        {chargement ? <p className="text-sm text-ink/55">Préparation des messages…</p> : null}
        {sansEmail && client ? (
          <p className="text-sm text-cap">{nomComplet(client)} n&apos;a pas d&apos;adresse e-mail. Complétez sa fiche, ou choisissez « Une adresse e-mail ».</p>
        ) : null}

        <Bascule
          label="Message"
          valeur={message}
          onChange={(valeur) => setMessage(valeur as "modele" | "libre")}
          options={[
            { value: "modele", label: "Message prédéfini" },
            { value: "libre", label: "Écrit à partir de zéro" },
          ]}
        />

        {message === "modele" ? (
          <>
            {destinataire === "client" && contextes && contextes.length > 1 ? (
              <Champ label="Dossier" aide="Le message reprend la référence, la destination et l'étape de ce dossier.">
                <select
                  className="champ"
                  value={contexte?.id ?? ""}
                  onChange={(event) => {
                    setDossierId(event.target.value);
                    const suivant = contextes.find((item) => item.id === event.target.value);
                    if (code && !suivant?.modeles.some((item) => item.code === code)) setCode("");
                  }}
                >
                  {contextes.map((item) => (
                    <option key={item.id || "aucun"} value={item.id}>{item.libelle}</option>
                  ))}
                </select>
              </Champ>
            ) : null}
            <Champ label="Message prédéfini" aide={destinataire === "adresse" ? "Sans client, les informations de dossier restent vides." : "Le texte est celui du modèle. Il n'est pas réécrit."}>
              <select className="champ" value={code} onChange={(event) => setCode(event.target.value)} required={pret || message === "modele"}>
                <option value="">Choisir un message</option>
                {catalogue.map((item) => (
                  <option key={item.code} value={item.code}>{item.libelle}</option>
                ))}
              </select>
            </Champ>
            {choisi ? (
              <div className="rounded-xl bg-paper px-3.5 py-3 text-sm">
                <p className="font-semibold">{choisi.sujet}</p>
                <p className="mt-2 whitespace-pre-line text-ink/70">{choisi.corps}</p>
              </div>
            ) : null}
            <input type="hidden" name="sujet" value={choisi?.sujet ?? ""} />
            <input type="hidden" name="corps" value={choisi?.corps ?? ""} />
            <input type="hidden" name="modele" value={code} />
          </>
        ) : (
          <>
            <Champ label="Objet">
              <input className="champ" name="sujet" required maxLength={200} placeholder="Objet de l'e-mail" />
            </Champ>
            <Champ label="Message">
              <textarea className="champ min-h-48" name="corps" required maxLength={8000} rows={10} placeholder="Bonjour," />
            </Champ>
            <input type="hidden" name="modele" value="" />
          </>
        )}

        {destinataire === "client" ? (
          <>
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="dossierId" value={contexte?.id ?? ""} />
          </>
        ) : null}
      </Formulaire>
    </Tiroir>
  );
}
