import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { LangProvider } from "@/contexts/LangContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Produccion from "./pages/Produccion";
import Remisiones from "./pages/Remisiones";
import Entregas from "./pages/Entregas";
import MisMotocarros from "./pages/MisMotocarros";
import Clientes from "./pages/Clientes";
import Importar from "./pages/Importar";
import Usuarios from "./pages/Usuarios";
import Bitacora from "./pages/Bitacora";
import Configuracion from "./pages/Configuracion";
import ReportesTurno from "./pages/ReportesTurno";
import Finanzas from "./pages/Finanzas";
import FinanzasMovimiento from "./pages/FinanzasMovimiento";
import Proveedores from "./pages/Proveedores";
import CrmOportunidades from "./pages/crm/CrmOportunidades";
import CrmOportunidadDetail from "./pages/crm/CrmOportunidadDetail";
import CrmActividades from "./pages/crm/CrmActividades";
import CrmRutas from "./pages/crm/CrmRutas";
import CrmEquipo from "./pages/crm/CrmEquipo";
import CrmTracker from "./pages/crm/CrmTracker";
import Inventario from "./pages/Inventario";
import Incidencias from "./pages/Incidencias";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" richColors />
      <BrowserRouter>
        <AuthProvider>
          <LangProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/produccion" element={<ProtectedRoute roles={["admin","fabrica","logistica","coordinador"]}><Produccion /></ProtectedRoute>} />
              <Route path="/inventario" element={<ProtectedRoute roles={["admin","fabrica","coordinador"]}><Inventario /></ProtectedRoute>} />
              <Route path="/incidencias" element={<ProtectedRoute roles={["admin","fabrica","coordinador"]}><Incidencias /></ProtectedRoute>} />
              <Route path="/reportes-turno" element={<ProtectedRoute roles={["admin","fabrica","logistica","coordinador"]}><ReportesTurno /></ProtectedRoute>} />
              <Route path="/remisiones" element={<Remisiones />} />
              <Route path="/entregas" element={<ProtectedRoute roles={["admin","logistica","coordinador"]}><Entregas /></ProtectedRoute>} />
              <Route path="/mis-motocarros" element={<ProtectedRoute roles={["admin","ventas","coordinador"]}><MisMotocarros /></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute roles={["admin","fabrica","coordinador"]}><Clientes /></ProtectedRoute>} />
              <Route path="/importar" element={<ProtectedRoute roles={["admin"]}><Importar /></ProtectedRoute>} />
              <Route path="/usuarios" element={<ProtectedRoute roles={["admin"]}><Usuarios /></ProtectedRoute>} />
              <Route path="/bitacora" element={<ProtectedRoute roles={["admin"]}><Bitacora /></ProtectedRoute>} />
              <Route path="/configuracion" element={<ProtectedRoute roles={["admin"]}><Configuracion /></ProtectedRoute>} />
              <Route path="/finanzas" element={<ProtectedRoute roles={["admin","finanzas","admin_financiero"]}><Finanzas /></ProtectedRoute>} />
              <Route path="/finanzas/:id" element={<ProtectedRoute roles={["admin","finanzas","admin_financiero"]}><FinanzasMovimiento /></ProtectedRoute>} />
              <Route path="/proveedores" element={<ProtectedRoute roles={["admin","finanzas","admin_financiero"]}><Proveedores /></ProtectedRoute>} />
              <Route path="/crm/oportunidades" element={<ProtectedRoute roles={["admin","ventas","director_ventas","coordinador_ventas","auxiliar_ventas"]}><CrmOportunidades /></ProtectedRoute>} />
              <Route path="/crm/oportunidades/:id" element={<ProtectedRoute roles={["admin","ventas","director_ventas","coordinador_ventas","auxiliar_ventas"]}><CrmOportunidadDetail /></ProtectedRoute>} />
              <Route path="/crm/actividades" element={<ProtectedRoute roles={["admin","ventas","director_ventas","coordinador_ventas","auxiliar_ventas"]}><CrmActividades /></ProtectedRoute>} />
              <Route path="/crm/rutas" element={<ProtectedRoute roles={["admin","ventas","director_ventas","coordinador_ventas","auxiliar_ventas"]}><CrmRutas /></ProtectedRoute>} />
              <Route path="/crm/equipo" element={<ProtectedRoute roles={["admin","director_ventas","coordinador_ventas"]}><CrmEquipo /></ProtectedRoute>} />
              <Route path="/crm/tracker" element={<ProtectedRoute roles={["admin","director_ventas","coordinador_ventas"]}><CrmTracker /></ProtectedRoute>} />
              <Route path="/buscar" element={<Navigate to="/produccion" replace />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </LangProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
