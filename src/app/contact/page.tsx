import { Formulaire } from "@/components/formulaire";
import { Champ } from "@/components/ui";
import { recevoirProspectPublic } from "@/server/actions";

export const metadata = { title: "Écrire à EduDesk" };

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-paper px-4 py-12">
      <div className="mx-auto grid w-full max-w-lg gap-6">
        <img src="/logo-edudesk.png" alt="EduDesk" className="h-11 w-auto" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Parler à EduDesk</h1>
          <p className="mt-2 text-ink/60">Laissez vos coordonnées. L'agence vous rappelle. Si ce numéro est déjà connu, aucune fiche en double n'est créée.</p>
        </div>
        <div className="carte p-6">
          <Formulaire action={recevoirProspectPublic} submit="Envoyer" succes="Message reçu. L'agence vous contacte." className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Prénom"><input className="champ" name="prenom" required /></Champ>
              <Champ label="Nom"><input className="champ" name="nom" required /></Champ>
            </div>
            <Champ label="Téléphone"><input className="champ" name="telephone" defaultValue="+225" required /></Champ>
            <Champ label="E-mail"><input className="champ" name="email" type="email" placeholder="Facultatif" /></Champ>
            <Champ label="Votre projet"><textarea className="champ" name="notes" rows={4} placeholder="Pays, études, visa…" /></Champ>
          </Formulaire>
        </div>
      </div>
    </main>
  );
}
