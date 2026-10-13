"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { login, type EtatAction } from "@/server/actions";

const COMPTES = [
  ["Direction", "direction@edudesk.ci"],
  ["Commerciale", "commerciale@edudesk.ci"],
  ["Commercial", "commercial@edudesk.ci"],
  ["Assistante", "assistante@edudesk.ci"],
  ["Comptable", "comptable@edudesk.ci"],
  ["École", "ecole@edudesk.ci"],
  ["Logistique", "logistique@edudesk.ci"],
  ["Partenaire", "partenaire@edudesk.ci"],
];

export function LoginForm() {
  const [email, setEmail] = useState("direction@edudesk.ci");
  const [motDePasse, setMotDePasse] = useState("Edudesk2026!");
  const [visible, setVisible] = useState(false);
  const [etat, action, pending] = useActionState(login as (etat: EtatAction, data: FormData) => Promise<EtatAction>, null);

  return (
    <form action={action} className="grid gap-5">
      <label className="etiquette">
        <span>E-mail</span>
        <span className="relative">
          <Mail size={17} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
          <input className="champ pl-11" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </span>
      </label>
      <label className="etiquette">
        <span>Mot de passe</span>
        <span className="relative">
          <Lock size={17} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/35" />
          <input
            className="champ px-11"
            name="motDePasse"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            value={motDePasse}
            onChange={(event) => setMotDePasse(event.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setVisible((valeur) => !valeur)}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-ink/40 hover:text-ink"
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </span>
      </label>
      {etat?.error ? (
        <p className="flex animate-entree items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-cap">
          <AlertTriangle size={16} /> {etat.error}
        </p>
      ) : null}
      <button className="bouton h-12 text-base" disabled={pending}>
        {pending ? <Loader2 size={18} className="animate-spin" /> : null}
        {pending ? "Connexion…" : "Se connecter"}
        {pending ? null : <ArrowRight size={18} />}
      </button>
      <div className="grid gap-2.5 border-t border-ink/[0.06] pt-5">
        <p className="text-xs font-semibold tracking-wide text-ink/45 uppercase">Essayer avec un compte de démonstration</p>
        <div className="flex flex-wrap gap-1.5">
          {COMPTES.map(([nom, valeur]) => (
            <button
              key={valeur}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${email === valeur ? "border-desk bg-desk text-white" : "border-ink/10 text-ink/70 hover:border-desk hover:text-desk"}`}
              onClick={() => {
                setEmail(valeur);
                setMotDePasse("Edudesk2026!");
              }}
            >
              {nom}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
