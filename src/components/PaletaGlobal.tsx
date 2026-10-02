import { useNavigate } from "react-router-dom";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { GROUPS, useNavItems } from "@/components/AppSidebar";
import { useLang } from "@/contexts/LangContext";

/**
 * Paleta de navegación (Ctrl/⌘ + K): salta a cualquier pantalla que la
 * persona pueda ver. La búsqueda de datos (clientes, remisiones, unidades)
 * entra como siguiente paso sobre esta misma paleta.
 */
export function PaletaGlobal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  const { t } = useLang();
  const items = useNavItems();

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t.layout.paletteTitle} />
      <CommandList>
        <CommandEmpty>{t.layout.paletteEmpty}</CommandEmpty>
        {GROUPS.map(g => {
          const list = items.filter(i => i.group === g);
          if (!list.length) return null;
          return (
            <CommandGroup key={g} heading={g === "Inicio" ? t.layout.paletteScreens : t.groups[g]}>
              {list.map(i => (
                <CommandItem
                  key={i.url}
                  value={`${t.nav[i.key]} ${t.groups[g]}`}
                  onSelect={() => { onOpenChange(false); nav(i.url); }}
                >
                  <span className="mr-3 grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                    <i.icon size={16} />
                  </span>
                  {t.nav[i.key]}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
