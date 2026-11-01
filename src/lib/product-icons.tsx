import {
  Smartphone, Tv, Wifi, Phone, ShieldAlert, Zap, ShoppingCart,
  CalendarClock, CalendarCheck, Package, Plus, Gauge, Headphones, Cable, Sparkles,
  Flame, Globe, Music, Router, ArrowRightLeft, SmartphoneCharging,
  Star, PhoneCall, Award, GraduationCap, Crown, MessageSquare,
  Layers, Shield, ShieldCheck, Laptop, Radio, BadgePlus,
  type LucideIcon,
} from "lucide-react";

/** Mapa de ícones únicos por código de produto. */
const CODE_ICONS: Record<string, { Icon: LucideIcon; color: string }> = {
  "nc":            { Icon: BadgePlus,          color: "var(--neon-green)"  },
  "tv":            { Icon: Tv,                 color: "var(--neon-yellow)" },
  "net":           { Icon: Wifi,               color: "var(--neon-green)"  },
  "voz":           { Icon: Phone,              color: "var(--neon-pink)"   },
  "wifi-total":    { Icon: Router,             color: "var(--neon-green)"  },
  "migracoes":     { Icon: ArrowRightLeft,     color: "var(--neon-yellow)" },
  "cv":            { Icon: Smartphone,         color: "var(--neon-blue)"   },
  "pp":            { Icon: SmartphoneCharging, color: "var(--neon-blue)"   },
  "sm-1a":         { Icon: Star,               color: "var(--neon-violet)" },
  "sm-2a":         { Icon: Star,               color: "var(--neon-violet)" },
  "sm-1a-estrela": { Icon: Sparkles,           color: "var(--neon-yellow)" },
  "sm-2a-estrela": { Icon: Sparkles,           color: "var(--neon-yellow)" },
  "sm-1a-movel":   { Icon: PhoneCall,          color: "var(--neon-violet)" },
  "sm-2a-movel":   { Icon: PhoneCall,          color: "var(--neon-violet)" },
  "xpert":         { Icon: Award,              color: "var(--neon-violet)" },
  "ecn":           { Icon: GraduationCap,      color: "var(--neon-violet)" },
  "premium":       { Icon: Crown,              color: "var(--neon-violet)" },
  "alarmes":       { Icon: ShieldAlert,        color: "var(--neon-red)"    },
  "smp":           { Icon: MessageSquare,      color: "var(--neon-orange)" },
  "acess":         { Icon: Headphones,         color: "var(--neon-orange)" },
  "pelicula":      { Icon: Layers,             color: "var(--neon-orange)" },
  "seguro":        { Icon: Shield,             color: "var(--neon-orange)" },
  "combina":       { Icon: ShoppingCart,       color: "var(--neon-pink)"   },
  "seg-fat":       { Icon: ShieldCheck,        color: "var(--neon-orange)" },
  "device":        { Icon: Laptop,             color: "var(--neon-orange)" },
  "hotspot":       { Icon: Radio,              color: "var(--neon-orange)" },
  "energia":       { Icon: Zap,                color: "var(--neon-orange)" },
};

/** Devolve um par ícone+cor para um código de produto conhecido. */
export function pickIconByCode(codigo: string | null | undefined): { Icon: LucideIcon; color: string } {
  const c = (codigo ?? "").toLowerCase().trim();
  return CODE_ICONS[c] ?? { Icon: Package, color: "var(--neon-blue)" };
}

/** Fallback por texto livre (usado para labels de secções, categorias, etc.). */
export function pickIcon(label: string | null | undefined): { Icon: LucideIcon; color: string } {
  const n = (label ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("net") || n.includes("internet") || n.includes("fibra")) return { Icon: Wifi, color: "var(--neon-green)" };
  if (n.includes("marcações") || n.includes("marcacoes")) return { Icon: CalendarCheck, color: "var(--neon-violet)" };
  if (n.includes("tv")) return { Icon: Tv, color: "var(--neon-yellow)" };
  if (n.includes("voz") || n.includes("fixo") || n.includes("telefone")) return { Icon: Phone, color: "var(--neon-pink)" };
  if (n.includes("5g") || n.includes("movel") || n.includes("móvel") || n.includes("mobile")) return { Icon: Smartphone, color: "var(--neon-blue)" };
  if (n.includes("marca")) return { Icon: CalendarClock, color: "var(--neon-violet)" };
  if (n.includes("alarm")) return { Icon: ShieldAlert, color: "var(--neon-red)" };
  if (n.includes("energia") || n.includes("galp") || n.includes("luz") || n.includes("gas")) return { Icon: Zap, color: "var(--neon-orange)" };
  if (n.includes("continente") || n.includes("combina")) return { Icon: ShoppingCart, color: "var(--neon-pink)" };
  if (n.includes("seguro")) return { Icon: ShieldAlert, color: "var(--neon-violet)" };
  if (n.includes("acess")) return { Icon: Headphones, color: "var(--neon-blue)" };
  if (n.includes("sp") && n.length <= 4) return { Icon: Sparkles, color: "var(--neon-yellow)" };
  if (n.includes("nc") || n.includes("novo")) return { Icon: Plus, color: "var(--neon-green)" };
  if (n.includes("negoc") || n.includes("negócio")) return { Icon: Gauge, color: "var(--neon-yellow)" };
  if (n.includes("cabo") || n.includes("router")) return { Icon: Cable, color: "var(--neon-green)" };
  if (n.includes("musica") || n.includes("música")) return { Icon: Music, color: "var(--neon-pink)" };
  if (n.includes("global") || n.includes("loja")) return { Icon: Globe, color: "var(--neon-blue)" };
  if (n.includes("chama")) return { Icon: Flame, color: "var(--neon-orange)" };
  return { Icon: Package, color: "var(--neon-blue)" };
}


/** Pequeno ícone de categoria — herda cor da categoria, sem brilho. */
export function NeonIcon({
  label, code, size = 14, className = "",
}: { label?: string | null; code?: string | null; size?: number; className?: string }) {
  const { Icon, color } = code ? pickIconByCode(code) : pickIcon(label);
  return (
    <Icon
      className={className}
      style={{ width: size, height: size, color }}
      aria-hidden
    />
  );
}


/** Badge neon consistente (mesma anatomia em todos os menus): ícone +
 *  texto (foreground) sobre fundo translúcido da cor da categoria.
 *  Legível em tema claro e escuro. */
export function NeonBadge({
  label, text, size = 9, className = "",
}: { label: string | null | undefined; text?: string; size?: number; className?: string }) {
  const { Icon, color } = pickIcon(label);
  return (
    <span className={`neon-badge ${className}`} style={{ color }}>
      <Icon style={{ width: size + 2, height: size + 2 }} aria-hidden />
      <span style={{ color: "var(--foreground)" }}>{text ?? label ?? ""}</span>
    </span>
  );
}
