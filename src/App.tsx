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
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Produccion from "./pages/Produccion";
import Remisiones from "./pages/Remisiones";
import RemisionesRefacciones from "./pages/RemisionesRefacciones";
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
import AlmacenRefacciones from "./pages/AlmacenRefacciones";
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
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/produccion" element={<ProtectedRoute modulo="produccion"><Produccion /></ProtectedRoute>} />
              <Route path="/inventario" element={<ProtectedRoute modulo="inventario"><Inventario /></ProtectedRoute>} />
              <Route path="/almacen-refacciones" element={<ProtectedRoute requireRefacciones><AlmacenRefacciones /></ProtectedRoute>} />
              <Route path="/incidencias" element={<ProtectedRoute modulo="inventario"><Incidencias /></ProtectedRoute>} />
              <Route path="/reportes-turno" element={<ProtectedRoute modulo="reportesTurno"><ReportesTurno /></ProtectedRoute>} />
              <Route path="/remisiones" element={<ProtectedRoute modulo="remisiones"><Remisiones /></ProtectedRoute>} />
              <Route path="/remisiones-refacciones" element={<ProtectedRoute requireRefacciones><RemisionesRefacciones /></ProtectedRoute>} />
              <Route path="/entregas" element={<ProtectedRoute modulo="entregas"><Entregas /></ProtectedRoute>} />
              <Route path="/mis-motocarros" element={<ProtectedRoute modulo="misMotocarros"><MisMotocarros /></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute modulo="clientes"><Clientes /></ProtectedRoute>} />
              <Route path="/importar" element={<ProtectedRoute modulo="importar"><Importar /></ProtectedRoute>} />
              <Route path="/usuarios" element={<ProtectedRoute modulo="usuarios"><Usuarios /></ProtectedRoute>} />
              <Route path="/bitacora" element={<ProtectedRoute modulo="bitacora"><Bitacora /></ProtectedRoute>} />
              <Route path="/configuracion" element={<ProtectedRoute modulo="configuracion"><Configuracion /></ProtectedRoute>} />
              <Route path="/finanzas" element={<ProtectedRoute modulo="finanzas"><Finanzas /></ProtectedRoute>} />
              <Route path="/finanzas/:id" element={<ProtectedRoute modulo="finanzas"><FinanzasMovimiento /></ProtectedRoute>} />
              <Route path="/proveedores" element={<ProtectedRoute modulo="proveedores"><Proveedores /></ProtectedRoute>} />
              <Route path="/crm/oportunidades" element={<ProtectedRoute modulo="crm"><CrmOportunidades /></ProtectedRoute>} />
              <Route path="/crm/oportunidades/:id" element={<ProtectedRoute modulo="crm"><CrmOportunidadDetail /></ProtectedRoute>} />
              <Route path="/crm/actividades" element={<ProtectedRoute modulo="crm"><CrmActividades /></ProtectedRoute>} />
              <Route path="/crm/rutas" element={<ProtectedRoute modulo="crm"><CrmRutas /></ProtectedRoute>} />
              <Route path="/crm/equipo" element={<ProtectedRoute modulo="crmEquipo"><CrmEquipo /></ProtectedRoute>} />
              <Route path="/crm/tracker" element={<ProtectedRoute modulo="crmEquipo"><CrmTracker /></ProtectedRoute>} />
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
