import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Red de seguridad de render.
 *
 * Sin esto, cualquier excepción dentro de un componente desmonta el árbol
 * entero y la app se queda en blanco — sin mensaje, sin menú y sin forma de
 * volver. Pasó en CRM → Actividades: un botón apuntaba a una función que no
 * existía y toda la aplicación se apagaba al entrar a la pantalla.
 *
 * Con el boundary, el error se queda encerrado en el área de contenido: la
 * persona ve qué pasó, puede reintentar y el resto del sistema sigue vivo.
 */
type Props = { children: ReactNode; area?: string };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Queda en la consola del navegador para poder pegarlo en un reporte.
    console.error(`Error en ${this.props.area ?? "la pantalla"}:`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-card border rounded-lg p-8 text-center space-y-4">
          <div className="flex justify-center text-amber-600"><AlertTriangle className="h-10 w-10" /></div>
          <h2 className="text-xl font-bold text-[#1F3864]">Esta pantalla se quedó atorada</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            No se perdió nada: es un error del sistema al dibujar la pantalla, no de tus datos.
            Puedes seguir usando el resto del menú.
          </p>
          <pre className="text-left text-xs bg-slate-50 border rounded p-3 overflow-x-auto text-slate-600">
            {error.message}
          </pre>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => this.setState({ error: null })} variant="outline" className="h-11">
              <RotateCcw className="h-4 w-4 mr-2" /> Reintentar
            </Button>
            <Button onClick={() => window.location.assign("/")} className="h-11 bg-[#1F3864] hover:bg-[#162a4d]">
              Ir al inicio
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
