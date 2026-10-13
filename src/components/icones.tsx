import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Crown,
  FileText,
  FolderOpen,
  GraduationCap,
  Handshake,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Package,
  Receipt,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  Workflow,
  ArrowDownCircle,
  type LucideIcon,
} from "lucide-react";

export const ICONES: Record<string, LucideIcon> = {
  tableau: LayoutDashboard,
  direction: Crown,
  rapports: BarChart3,
  prospects: UserPlus,
  clients: Users,
  partenaires: Handshake,
  missions: ListChecks,
  dossiers: FolderOpen,
  procedures: Workflow,
  ecoles: GraduationCap,
  caisse: Wallet,
  creances: Receipt,
  depenses: ArrowDownCircle,
  comptabilite: BookOpen,
  equipe: UsersRound,
  conges: CalendarDays,
  inventaire: Package,
  sms: MessageSquare,
  page: FileText,
};

export function Icone({ nom, size = 18, className }: { nom: string; size?: number; className?: string }) {
  const Composant = ICONES[nom] ?? FileText;
  return <Composant size={size} className={className} />;
}
