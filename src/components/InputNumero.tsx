// Input numérico de plataforma: muestra miles con coma (25,000.00).
import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  formatearEntradaNumerica, numeroATextoInput, parseNumero,
} from "@/lib/numeros";
import { cn } from "@/lib/utils";

export interface InputNumeroProps
  extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> {
  /** Valor controlado (número o texto ya formateado). */
  value: number | string | null | undefined;
  /** Notifica el número parseado (o null si el campo queda vacío). */
  onValueChange: (valor: number | null) => void;
  /** Decimales máximos al escribir / al salir. Default 2 (montos). */
  decimales?: number;
  /** Si true, al salir formatea con decimales fijos (25,000.00). */
  fijarDecimalesAlSalir?: boolean;
}

export const InputNumero = React.forwardRef<HTMLInputElement, InputNumeroProps>(
  (
    {
      value,
      onValueChange,
      decimales = 2,
      fijarDecimalesAlSalir = true,
      className,
      onBlur,
      onFocus,
      ...rest
    },
    ref,
  ) => {
    const [texto, setTexto] = React.useState(() =>
      numeroATextoInput(value, fijarDecimalesAlSalir ? decimales : 0),
    );
    const enfocado = React.useRef(false);

    React.useEffect(() => {
      if (enfocado.current) return;
      setTexto(numeroATextoInput(value, fijarDecimalesAlSalir ? decimales : 0));
    }, [value, decimales, fijarDecimalesAlSalir]);

    return (
      <Input
        {...rest}
        ref={ref}
        type="text"
        inputMode="decimal"
        className={cn("tabular-nums", className)}
        value={texto}
        onFocus={e => {
          enfocado.current = true;
          onFocus?.(e);
        }}
        onChange={e => {
          const next = formatearEntradaNumerica(e.target.value, decimales);
          setTexto(next);
          onValueChange(parseNumero(next));
        }}
        onBlur={e => {
          enfocado.current = false;
          const n = parseNumero(texto);
          if (n == null) {
            setTexto("");
            onValueChange(null);
          } else {
            const limpio = numeroATextoInput(
              n,
              fijarDecimalesAlSalir ? decimales : (Number.isInteger(n) ? 0 : decimales),
            );
            setTexto(limpio);
            onValueChange(n);
          }
          onBlur?.(e);
        }}
      />
    );
  },
);
InputNumero.displayName = "InputNumero";
