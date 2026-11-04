"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Formulaire } from "@/components/formulaire";
import { Tiroir } from "@/components/tiroir";
import { Champ } from "@/components/ui";
import { envoyerCourrier } from "@/server/communication-actions";

type ModeleCourrier = { code: string; libelle: string; sujet: string; corps: string };
type ContexteCourrier = { id: string; libelle: string; modeles: ModeleCourrier[] };

export function EcrireCourrier({
  clientId,
  email,
  contextes,
  variante = "second",
  className = "",
}: {
  clientId: string;
  email: string;
  contextes: ContexteCourrier[];
  variante?: "principal" | "second";
  className?: string;
}) {
  const [dossierId, setDossierId] = useState(contextes[0]?.id ?? "");
  const [code, setCode] = useState("");
  const contexte = contextes.find((item) => item.id === dossierId) ?? contextes[0];
  const modele = contexte?.modeles.find((item) => item.code === code);
  const cle = `${contexte?.id ?? ""}:${code}`;

  return (
    <Tiroir
      label="Écrire un e-mail"
      icone={<Mail size={15} />}
      titre="Écrire au client"
      description={email}
      variante={variante}
      largeur="lg"
      className={className}
    >
      <Formulaire action={envoyerCourrier} submit="Envoyer l'e-mail" succes="E-mail envoyé" icone={<Mail size={15} />} className="grid gap-4">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="dossierId" value={contexte?.id ?? ""} />
        {contextes.length > 1 ? (
          <Champ label="Dossier" aide="Les mots du modèle (référence, destination, étape) sont repris de ce dossier.">
            <select
              className="champ"
              value={dossierId}
              onChange={(event) => {
                const suivant = contextes.find((item) => item.id === event.target.value);
                setDossierId(event.target.value);
                if (code && !suivant?.modeles.some((item) => item.code === code)) setCode("");
              }}
            >
              {contextes.map((item) => (
                <option key={item.id || "aucun"} value={item.id}>{item.libelle}</option>
              ))}
            </select>
          </Champ>
        ) : null}
        <Champ label="Modèle" aide="Le modèle remplit l'objet et le message. Vous pouvez tout modifier avant l'envoi.">
          <select className="champ" value={code} onChange={(event) => setCode(event.target.value)}>
            <option value="">Écrire sans modèle</option>
            {contexte?.modeles.map((item) => (
              <option key={item.code} value={item.code}>{item.libelle}</option>
            ))}
          </select>
        </Champ>
        <Champ label="Objet">
          <input key={`${cle}:sujet`} className="champ" name="sujet" required maxLength={200} defaultValue={modele?.sujet ?? ""} placeholder="Objet de l'e-mail" />
        </Champ>
        <Champ label="Message">
          <textarea key={`${cle}:corps`} className="champ min-h-64" name="corps" required maxLength={8000} rows={12} defaultValue={modele?.corps ?? ""} placeholder="Bonjour," />
        </Champ>
      </Formulaire>
    </Tiroir>
  );
}
